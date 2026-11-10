import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function streamToResponse(source, res) {
  try {
    await pipeline(source, res);
  } catch (error) {
    if (error.code === 'ERR_STREAM_PREMATURE_CLOSE' && res.destroyed) return;
    throw error;
  }
}

function safeStoredFile(filePath) {
  if (!filePath || path.basename(filePath) !== filePath || filePath.includes('..')) return null;
  const resolved = path.resolve(config.mediaRoot, 'video', filePath);
  return resolved.startsWith(`${path.resolve(config.mediaRoot, 'video')}${path.sep}`) ? resolved : null;
}

async function resolveMedia(kind, id, user) {
  if (kind === 'movie') {
    const [rows] = await pool.execute(`SELECT id, video_path, external_video_url,
      is_published, downloads_enabled, title
      FROM movies WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0] || (!rows[0].is_published && user.role !== 'admin')) return null;
    return { ...rows[0], mediaColumn: 'movie_id' };
  }
  if (kind === 'episode') {
    const [rows] = await pool.execute(`SELECT e.id, e.video_path, e.external_video_url, e.is_published,
      e.downloads_enabled, e.title, sr.is_published AS series_published
      FROM episodes e JOIN seasons se ON se.id = e.season_id
      JOIN series sr ON sr.id = se.series_id WHERE e.id = ? LIMIT 1`, [id]);
    if (!rows[0] || (!rows[0].is_published || !rows[0].series_published) && user.role !== 'admin') return null;
    return { ...rows[0], mediaColumn: 'episode_id' };
  }
  return null;
}

function getTrustedRemoteUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')
    || url.username || url.password
    || !config.allowedMediaHosts.includes(url.hostname.toLowerCase())) {
    return null;
  }
  return url;
}

async function sendRemoteVideo(req, res, media, download) {
  const url = getTrustedRemoteUrl(media.external_video_url);
  if (!url) return res.status(502).json({ error: 'The configured streaming host is not trusted.' });
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      redirect: 'manual'
    });
  } catch (error) {
    error.status = 502;
    throw error;
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    return res.status(502).json({ error: 'The media host returned an unsupported redirect.' });
  }
  if (![200, 206, 416].includes(upstream.status)) {
    return res.status(502).json({ error: 'The trusted media host could not provide this video.' });
  }
  const contentType = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (upstream.status !== 416 && !contentType?.startsWith('video/')) {
    return res.status(502).json({ error: 'The configured URL did not return a video stream.' });
  }
  if (download && !media.downloads_enabled && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Downloads are not enabled for this title.' });
  }
  if (download) {
    const quality = 'original';
    await pool.execute(`INSERT INTO downloads (user_id, ${media.mediaColumn}, quality) VALUES (?, ?, ?)`,
      [req.user.id, media.id, quality]);
    res.set('Content-Disposition',
      `attachment; filename="${path.basename(media.title).replace(/[\r\n"\\]/g, '_')}.mp4"`);
  }
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(header);
    if (value && /^[\w\s/;=-]+$/.test(value)) {
      res.set(header === 'content-range' ? 'Content-Range'
        : header === 'content-length' ? 'Content-Length' : 'Accept-Ranges', value);
    }
  }
  res.set('Content-Type', contentType || 'video/mp4');
  res.set('Cache-Control', 'private, no-store');
  res.status(upstream.status);
  if (!upstream.body || upstream.status === 416) return res.end();
  await streamToResponse(Readable.fromWeb(upstream.body), res);
}

async function sendVideo(req, res, media, download) {
  let filePath = media.video_path;
  let quality = 'original';
  const variantTable = media.mediaColumn === 'movie_id' ? 'movie_video_variants' : 'episode_video_variants';
  if (download) {
    if (!media.downloads_enabled && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Downloads are not enabled for this title.' });
    }
    quality = req.query.quality || (media.video_path ? 'original' : '720p');
    if (!['original', '480p', '720p', '1080p'].includes(quality)) {
      return res.status(400).json({ error: 'Choose a supported download quality.' });
    }
    if (quality !== 'original') {
      const [variants] = await pool.execute(
        `SELECT file_path FROM ${variantTable} WHERE ${media.mediaColumn} = ? AND quality = ? LIMIT 1`,
        [media.id, quality]
      );
      if (!variants[0]) return res.status(404).json({ error: `No ${quality} file is available.` });
      filePath = variants[0].file_path;
    }
    if (quality === 'original' && !media.video_path && !media.external_video_url) {
      return res.status(404).json({ error: 'The original video is not available.' });
    }
  } else if (!filePath) {
    const [variants] = await pool.execute(
      `SELECT file_path FROM ${variantTable} WHERE ${media.mediaColumn} = ?
        ORDER BY FIELD(quality, '1080p', '720p', '480p') LIMIT 1`,
      [media.id]
    );
    filePath = variants[0]?.file_path;
  }
  if (!filePath && quality === 'original' && media.external_video_url) {
    return sendRemoteVideo(req, res, media, download);
  }
  if (!filePath) return res.status(404).json({ error: 'No uploaded video is available.' });
  const file = safeStoredFile(filePath);
  if (!file) return res.status(404).json({ error: 'Media file was not found.' });
  const stat = await fs.promises.stat(file).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat?.isFile()) return res.status(404).json({ error: 'Media file was not found.' });

  const range = req.headers.range;
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (range && !match) return res.status(416).end();
  let start = 0;
  let end = stat.size - 1;
  if (match) {
    if (!match[1] && !match[2]) return res.status(416).end();
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, stat.size - suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (start >= stat.size || start > end) {
      res.set('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
  }

  if (download) {
    await pool.execute(`INSERT INTO downloads (user_id, ${media.mediaColumn}, quality) VALUES (?, ?, ?)`,
      [req.user.id, media.id, quality]);
    res.set('Content-Disposition', `attachment; filename="${path.basename(media.title).replace(/[\r\n"\\]/g, '_')}${path.extname(file)}"`);
  }

  res.set({
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': path.extname(file).toLowerCase() === '.webm' ? 'video/webm'
      : path.extname(file).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4',
    'Cache-Control': 'private, no-store'
  });
  if (match) res.status(206).set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  await streamToResponse(fs.createReadStream(file, { start, end }), res);
}

router.get('/images/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.status(404).end();
  const file = path.resolve(config.mediaRoot, 'images', filename);
  const root = path.resolve(config.mediaRoot, 'images');
  if (!file.startsWith(`${root}${path.sep}`)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.sendFile(file, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).end();
  });
}));

router.get('/subtitles/:id', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT st.file_path, m.is_published AS movie_published,
    e.is_published AS episode_published, sr.is_published AS series_published
    FROM subtitles st LEFT JOIN movies m ON m.id = st.movie_id
    LEFT JOIN episodes e ON e.id = st.episode_id
    LEFT JOIN seasons se ON se.id = e.season_id
    LEFT JOIN series sr ON sr.id = se.series_id
    WHERE st.id = ? LIMIT 1`, [req.params.id]);
  const subtitle = rows[0];
  if (!subtitle) return res.status(404).json({ error: 'Subtitle not found.' });
  const isPublished = subtitle.movie_published !== null
    ? Boolean(subtitle.movie_published)
    : Boolean(subtitle.episode_published && subtitle.series_published);
  if (!isPublished && req.user.role !== 'admin') {
    return res.status(404).json({ error: 'Published subtitle not found.' });
  }
  const filename = path.basename(subtitle.file_path);
  if (filename !== subtitle.file_path) return res.status(404).end();
  const file = path.resolve(config.mediaRoot, 'subtitles', filename);
  const root = path.resolve(config.mediaRoot, 'subtitles');
  if (!file.startsWith(`${root}${path.sep}`)) return res.status(404).end();
  res.set({ 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, no-store' });
  res.sendFile(file, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).end();
  });
}));

router.get('/:kind/:id/stream', requireAuth, asyncHandler(async (req, res) => {
  const media = await resolveMedia(req.params.kind, req.params.id, req.user);
  if (!media) return res.status(404).json({ error: 'Published media not found.' });
  await sendVideo(req, res, media, false);
}));

router.get('/:kind/:id/download', requireAuth, asyncHandler(async (req, res) => {
  const media = await resolveMedia(req.params.kind, req.params.id, req.user);
  if (!media) return res.status(404).json({ error: 'Published media not found.' });
  await sendVideo(req, res, media, true);
}));

export default router;
