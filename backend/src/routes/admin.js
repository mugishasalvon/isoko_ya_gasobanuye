import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import {
  getMovieRelations,
  getSeriesCategoryIds,
  withEpisodeRelations
} from '../lib/content-relations.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { uploadContent } from '../middleware/uploads.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const optionalNumber = (schema) => z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  schema.optional()
);
const formBoolean = z.preprocess((value) => value === true || value === 'true', z.boolean());
const optionalDate = z.preprocess((value) => value === '' || value === undefined ? undefined : value,
  z.string().date().optional());
const optionalUrl = z.preprocess((value) => value === '' || value === undefined ? undefined : value,
  z.string().url().max(2000).optional());

function trustedMediaUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password
    || !config.allowedMediaHosts.includes(url.hostname.toLowerCase())) {
    const error = new Error('Streaming URLs must use HTTPS and a host listed in MEDIA_ALLOWED_HOSTS.');
    error.status = 400;
    throw error;
  }
  return url.toString();
}

const movieInput = z.object({
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(10000),
  release_year: optionalNumber(z.coerce.number().int().min(1888).max(2200)),
  duration_minutes: optionalNumber(z.coerce.number().int().positive().max(1000)),
  rating: optionalNumber(z.coerce.number().min(0).max(10)),
  age_rating: z.string().max(12).optional(),
  director: z.string().max(240).optional(),
  subtitle_translator_id: optionalNumber(z.coerce.number().int().positive()),
  cast: z.string().optional(),
  poster_url: z.string().max(1000).optional(),
  banner_url: z.string().max(1000).optional(),
  external_video_url: optionalUrl,
  is_published: formBoolean.optional(),
  downloads_enabled: formBoolean.optional(),
  category_ids: z.string().optional()
});

function parseJsonList(value) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch {
    const error = new Error('cast must be valid JSON.');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(parsed)) {
    const error = new Error('cast must be a JSON array.');
    error.status = 400;
    throw error;
  }
  return parsed.map((item) => String(item).slice(0, 120));
}

function parseCategoryIds(value) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch {
    const error = new Error('category_ids must be valid JSON.');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(parsed)) {
    const error = new Error('category_ids must be a JSON array.');
    error.status = 400;
    throw error;
  }
  return [...new Set(parsed.map((id) => z.coerce.number().int().positive().parse(id)))];
}

async function setMovieCategories(connection, movieId, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const [categories] = await connection.execute(
    `SELECT id FROM categories WHERE id IN (${placeholders})`, ids
  );
  if (categories.length !== ids.length) {
    const error = new Error('One or more categories do not exist.');
    error.status = 400;
    throw error;
  }
  await connection.query('INSERT IGNORE INTO movie_categories (movie_id, category_id) VALUES ?',
    [ids.map((id) => [movieId, id])]);
}

async function assertSubtitleTranslator(connection, id) {
  if (!id) return;
  const [rows] = await connection.execute(
    'SELECT id FROM subtitle_translators WHERE id = ? LIMIT 1', [id]
  );
  if (!rows[0]) {
    const error = new Error('The selected subtitle translator profile does not exist.');
    error.status = 400;
    throw error;
  }
}

async function setSeriesCategories(connection, seriesId, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const [categories] = await connection.execute(
    `SELECT id FROM categories WHERE id IN (${placeholders})`, ids
  );
  if (categories.length !== ids.length) {
    const error = new Error('One or more categories do not exist.');
    error.status = 400;
    throw error;
  }
  await connection.query('INSERT IGNORE INTO series_categories (series_id, category_id) VALUES ?',
    [ids.map((id) => [seriesId, id])]);
}

const videoVariantFields = [
  ['480p', 'video_480p'],
  ['720p', 'video_720p'],
  ['1080p', 'video_1080p']
];

async function saveVideoVariants(connection, table, column, contentId, files) {
  const uploaded = videoVariantFields
    .map(([quality, field]) => [quality, files?.[field]?.[0]?.filename])
    .filter(([, filename]) => filename);
  for (const [quality, filename] of uploaded) {
    await connection.execute(
      `INSERT INTO ${table} (${column}, quality, file_path) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE file_path = VALUES(file_path)`,
      [contentId, quality, filename]
    );
  }
}

const seriesInput = z.object({
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(10000),
  release_year: optionalNumber(z.coerce.number().int().min(1888).max(2200)),
  rating: optionalNumber(z.coerce.number().min(0).max(10)),
  season_count: z.coerce.number().int().min(1).max(20).default(1),
  episodes_per_season: z.coerce.number().int().min(0).max(100).default(0),
  subtitle_translator_id: optionalNumber(z.coerce.number().int().positive()),
  cast: z.string().optional(),
  poster_url: z.string().max(1000).optional(),
  banner_url: z.string().max(1000).optional(),
  is_published: formBoolean.optional(),
  category_ids: z.string().optional()
}).refine((input) => input.season_count * input.episodes_per_season <= 500, {
  message: 'A series can create up to 500 episode drafts at a time.',
  path: ['episodes_per_season']
});

const episodeInput = z.object({
  episode_number: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10000).optional(),
  duration_minutes: optionalNumber(z.coerce.number().int().positive().max(1000)),
  release_date: optionalDate,
  thumbnail_url: z.string().max(1000).optional(),
  external_video_url: optionalUrl,
  is_published: formBoolean.optional(),
  downloads_enabled: formBoolean.optional()
});

async function createEpisodeDrafts(connection, seasonId, count) {
  if (!count) return;
  const episodes = Array.from({ length: count }, (_, index) => [
    seasonId, index + 1, `Episode ${index + 1}`
  ]);
  await connection.query(
    'INSERT INTO episodes (season_id, episode_number, title) VALUES ?',
    [episodes]
  );
}

router.get('/stats', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM movies) AS movies,
    (SELECT COUNT(*) FROM series) AS series,
    (SELECT COUNT(*) FROM episodes) AS episodes,
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COALESCE(SUM(views), 0) FROM movies) +
      (SELECT COALESCE(SUM(views), 0) FROM episodes) AS views,
    (SELECT COUNT(*) FROM downloads) AS downloads`);
  const [popular] = await pool.query(
    'SELECT id, title, views FROM movies ORDER BY views DESC LIMIT 5'
  );
  res.json({ stats: rows[0], most_watched: popular });
}));

router.get('/translators', asyncHandler(async (_req, res) => {
  const [items] = await pool.query(`SELECT t.id, t.name, t.bio, t.image_url, t.created_at,
    (SELECT COUNT(*) FROM movies m WHERE m.subtitle_translator_id = t.id) AS movie_count,
    (SELECT COUNT(*) FROM series s WHERE s.subtitle_translator_id = t.id) AS series_count
    FROM subtitle_translators t ORDER BY t.name`);
  res.json({ items });
}));

router.post('/translators', uploadContent, asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(1).max(240),
    bio: z.string().trim().max(5000).optional()
  }).parse(req.body);
  const image = req.files?.translator_avatar?.[0]?.filename;
  const [result] = await pool.execute(
    'INSERT INTO subtitle_translators (name, bio, image_url) VALUES (?, ?, ?)',
    [input.name, input.bio || null, image ? `/api/media/images/${image}` : null]
  );
  res.status(201).json({ id: result.insertId, ...input, image_url: image ? `/api/media/images/${image}` : null });
}));

router.put('/translators/:id', uploadContent, asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(1).max(240),
    bio: z.string().trim().max(5000).optional()
  }).parse(req.body);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const image = req.files?.translator_avatar?.[0]?.filename;
  const [result] = await pool.execute(`UPDATE subtitle_translators SET name = ?, bio = ?,
    image_url = COALESCE(?, image_url) WHERE id = ?`,
  [input.name, input.bio || null, image ? `/api/media/images/${image}` : null, id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Subtitle translator not found.' });
  res.json({ id, ...input, ...(image ? { image_url: `/api/media/images/${image}` } : {}) });
}));

router.delete('/translators/:id', asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const [[translator]] = await pool.execute(
    `SELECT id,
      (SELECT COUNT(*) FROM movies WHERE subtitle_translator_id = ?) AS movie_count,
      (SELECT COUNT(*) FROM series WHERE subtitle_translator_id = ?) AS series_count
      FROM subtitle_translators WHERE id = ?`,
    [id, id, id]
  );
  if (!translator) return res.status(404).json({ error: 'Subtitle translator not found.' });
  if (Number(translator.movie_count) > 0 || Number(translator.series_count) > 0) {
    return res.status(409).json({ error: 'This translator is assigned to movies or series. Reassign or remove the translator from those titles before deleting this profile.' });
  }
  await pool.execute('DELETE FROM subtitle_translators WHERE id = ?', [id]);
  res.status(204).end();
}));

router.get('/movies', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`SELECT m.id, m.slug, m.title, m.description, m.release_year,
    m.duration_minutes, m.rating, m.age_rating, m.director, m.subtitle_translator_id,
    COALESCE(t.name, m.subtitle_translator_name) AS subtitle_translator_name,
    COALESCE(t.image_url, m.subtitle_translator_image_url) AS subtitle_translator_image_url,
    m.cast, m.poster_url, m.banner_url, m.is_published, m.downloads_enabled, m.external_video_url
    FROM movies m LEFT JOIN subtitle_translators t ON t.id = m.subtitle_translator_id
    ORDER BY m.updated_at DESC LIMIT 200`);
  const relations = await getMovieRelations(rows.map((item) => item.id));
  const items = rows.map((item) => ({
    ...item,
    category_ids: relations.get(String(item.id)).category_ids,
    subtitles: relations.get(String(item.id)).subtitles
  }));
  res.json({ items });
}));

router.post('/movies', uploadContent, asyncHandler(async (req, res) => {
  const input = movieInput.parse(req.body);
  const cast = parseJsonList(input.cast);
  const categoryIds = parseCategoryIds(input.category_ids);
  const poster = req.files?.poster?.[0]?.filename;
  const banner = req.files?.banner?.[0]?.filename;
  const video = req.files?.video?.[0]?.filename;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertSubtitleTranslator(connection, input.subtitle_translator_id);
    const [result] = await connection.execute(`INSERT INTO movies
      (slug, title, description, release_year, duration_minutes, rating, age_rating, director,
        subtitle_translator_id, cast, poster_url, banner_url,
        video_path, external_video_url, is_published, downloads_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.slug, input.title, input.description, input.release_year || null,
      input.duration_minutes || null, input.rating || 0, input.age_rating || null,
      input.director || null, input.subtitle_translator_id || null,
      JSON.stringify(cast), poster ? `/api/media/images/${poster}` : input.poster_url || null,
      banner ? `/api/media/images/${banner}` : input.banner_url || null,
      video || null, trustedMediaUrl(input.external_video_url), input.is_published || false,
      input.downloads_enabled || false]);
    await setMovieCategories(connection, result.insertId, categoryIds);
    await saveVideoVariants(connection, 'movie_video_variants', 'movie_id', result.insertId, req.files);
    await connection.commit();
    res.status(201).json({ id: result.insertId, slug: input.slug });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.put('/movies/:id', uploadContent, asyncHandler(async (req, res) => {
  const input = movieInput.parse(req.body);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const cast = parseJsonList(input.cast);
  const categoryIds = parseCategoryIds(input.category_ids);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.execute(
      'SELECT id, external_video_url FROM movies WHERE id = ? LIMIT 1', [id]
    );
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: 'Movie not found.' });
    }
    await assertSubtitleTranslator(connection, input.subtitle_translator_id);
    const [result] = await connection.execute(`UPDATE movies SET slug = ?, title = ?, description = ?,
      release_year = ?, duration_minutes = ?, rating = ?, age_rating = ?, director = ?,
      subtitle_translator_id = ?, subtitle_translator_name = NULL, subtitle_translator_image_url = NULL,
      cast = ?, poster_url = COALESCE(?, poster_url), banner_url = COALESCE(?, banner_url),
      video_path = COALESCE(?, video_path), external_video_url = ?, is_published = ?,
      downloads_enabled = ? WHERE id = ?`,
    [input.slug, input.title, input.description, input.release_year || null,
      input.duration_minutes || null, input.rating || 0, input.age_rating || null,
      input.director || null, input.subtitle_translator_id || null,
      JSON.stringify(cast),
      req.files?.poster?.[0] ? `/api/media/images/${req.files.poster[0].filename}` : input.poster_url || null,
      req.files?.banner?.[0] ? `/api/media/images/${req.files.banner[0].filename}` : input.banner_url || null,
      req.files?.video?.[0]?.filename || null,
      input.external_video_url === undefined
        ? existing.external_video_url
        : trustedMediaUrl(input.external_video_url),
      input.is_published || false,
      input.downloads_enabled || false, id]);
    if (input.category_ids !== undefined) {
      await connection.execute('DELETE FROM movie_categories WHERE movie_id = ?', [id]);
      await setMovieCategories(connection, id, categoryIds);
    }
    await saveVideoVariants(connection, 'movie_video_variants', 'movie_id', id, req.files);
    await connection.commit();
    res.json({ id, slug: input.slug });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.put('/movies/:id/publish', asyncHandler(async (req, res) => {
  const isPublished = formBoolean.parse(req.body.is_published);
  const [result] = await pool.execute('UPDATE movies SET is_published = ? WHERE id = ?',
    [isPublished, z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Movie not found.' });
  res.json({ is_published: isPublished });
}));

router.delete('/movies/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM movies WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Movie not found.' });
  res.status(204).end();
}));

router.get('/series', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`SELECT s.id, s.slug, s.title, s.description, s.release_year,
    s.rating, s.subtitle_translator_id, t.name AS subtitle_translator_name,
    t.image_url AS subtitle_translator_image_url, s.poster_url, s.banner_url, s.is_published, s.cast
    FROM series s LEFT JOIN subtitle_translators t ON t.id = s.subtitle_translator_id
    ORDER BY s.updated_at DESC`);
  const categories = await getSeriesCategoryIds(rows.map((item) => item.id));
  const items = rows.map((item) => ({
    ...item,
    category_ids: categories.get(String(item.id))
  }));
  res.json({ items });
}));

router.get('/seasons', asyncHandler(async (_req, res) => {
  const [items] = await pool.query(`SELECT se.id, se.series_id, se.season_number, se.title, se.poster_url,
    sr.title AS series_title FROM seasons se JOIN series sr ON sr.id = se.series_id
    ORDER BY sr.title, se.season_number`);
  res.json({ items });
}));

router.get('/episodes', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`SELECT e.id, e.season_id, e.episode_number, e.title,
    e.description, e.duration_minutes, e.release_date, e.thumbnail_url, e.is_published,
    e.downloads_enabled, e.external_video_url, se.season_number, sr.id AS series_id,
    sr.title AS series_title
    FROM episodes e JOIN seasons se ON se.id = e.season_id
    JOIN series sr ON sr.id = se.series_id ORDER BY sr.title, se.season_number, e.episode_number`);
  const related = await withEpisodeRelations(rows);
  const items = related.map(({ download_qualities: _qualities, subtitles, ...episode }) => ({
    ...episode,
    subtitles
  }));
  res.json({ items });
}));

router.post('/series', uploadContent, asyncHandler(async (req, res) => {
  const input = seriesInput.parse(req.body);
  const cast = parseJsonList(input.cast);
  const categories = parseCategoryIds(input.category_ids);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertSubtitleTranslator(connection, input.subtitle_translator_id);
    const [result] = await connection.execute(`INSERT INTO series
      (slug, title, description, release_year, rating, subtitle_translator_id, cast,
        poster_url, banner_url, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.slug, input.title, input.description, input.release_year || null, input.rating || 0,
      input.subtitle_translator_id || null,
      JSON.stringify(cast),
      req.files?.poster?.[0] ? `/api/media/images/${req.files.poster[0].filename}` : input.poster_url || null,
      req.files?.banner?.[0] ? `/api/media/images/${req.files.banner[0].filename}` : input.banner_url || null,
      input.is_published || false]);
    await setSeriesCategories(connection, result.insertId, categories);
    let firstSeasonId;
    for (let seasonNumber = 1; seasonNumber <= input.season_count; seasonNumber += 1) {
      const [season] = await connection.execute(
        'INSERT INTO seasons (series_id, season_number, title) VALUES (?, ?, ?)',
        [result.insertId, seasonNumber, `Season ${seasonNumber}`]
      );
      if (seasonNumber === 1) firstSeasonId = season.insertId;
      await createEpisodeDrafts(connection, season.insertId, input.episodes_per_season);
    }
    await connection.commit();
    res.status(201).json({
      id: result.insertId,
      slug: input.slug,
      season_id: firstSeasonId,
      season_count: input.season_count,
      episodes_per_season: input.episodes_per_season
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.put('/series/:id', uploadContent, asyncHandler(async (req, res) => {
  const input = seriesInput.parse(req.body);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const categories = parseCategoryIds(input.category_ids);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.execute('SELECT id FROM series WHERE id = ? LIMIT 1', [id]);
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: 'Series not found.' });
    }
    await assertSubtitleTranslator(connection, input.subtitle_translator_id);
    const [result] = await connection.execute(`UPDATE series SET slug = ?, title = ?, description = ?,
      release_year = ?, rating = ?, subtitle_translator_id = ?, cast = ?, poster_url = COALESCE(?, poster_url),
      banner_url = COALESCE(?, banner_url), is_published = ? WHERE id = ?`,
    [input.slug, input.title, input.description, input.release_year || null, input.rating || 0,
      input.subtitle_translator_id || null,
      JSON.stringify(parseJsonList(input.cast)),
      req.files?.poster?.[0] ? `/api/media/images/${req.files.poster[0].filename}` : input.poster_url || null,
      req.files?.banner?.[0] ? `/api/media/images/${req.files.banner[0].filename}` : input.banner_url || null,
      input.is_published || false, id]);
    if (input.category_ids !== undefined) {
      await connection.execute('DELETE FROM series_categories WHERE series_id = ?', [id]);
      await setSeriesCategories(connection, id, categories);
    }
    await connection.commit();
    res.json({ id, slug: input.slug });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/series/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM series WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Series not found.' });
  res.status(204).end();
}));

router.put('/series/:id/publish', asyncHandler(async (req, res) => {
  const isPublished = formBoolean.parse(req.body.is_published);
  const [result] = await pool.execute('UPDATE series SET is_published = ? WHERE id = ?',
    [isPublished, z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Series not found.' });
  res.json({ is_published: isPublished });
}));

router.post('/series/:id/seasons', uploadContent, asyncHandler(async (req, res) => {
  const seriesId = z.coerce.number().int().positive().parse(req.params.id);
  const input = z.object({
    season_number: z.coerce.number().int().positive(),
    title: z.string().trim().max(240).optional(),
    episode_count: z.coerce.number().int().min(0).max(100).default(0)
  }).parse(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO seasons (series_id, season_number, title, poster_url) VALUES (?, ?, ?, ?)',
      [seriesId, input.season_number, input.title || `Season ${input.season_number}`,
        req.files?.poster?.[0] ? `/api/media/images/${req.files.poster[0].filename}` : null]
    );
    await createEpisodeDrafts(connection, result.insertId, input.episode_count);
    await connection.commit();
    res.status(201).json({ id: result.insertId, series_id: seriesId, ...input });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.put('/seasons/:id', uploadContent, asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const poster = req.files?.poster?.[0]?.filename;
  const [result] = await pool.execute(
    'UPDATE seasons SET poster_url = COALESCE(?, poster_url) WHERE id = ?',
    [poster ? `/api/media/images/${poster}` : null, id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Season not found.' });
  res.json({ id, poster_url: poster ? `/api/media/images/${poster}` : undefined });
}));

router.delete('/seasons/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM seasons WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Season not found.' });
  res.status(204).end();
}));

router.post('/seasons/:id/episodes', uploadContent, asyncHandler(async (req, res) => {
  const seasonId = z.coerce.number().int().positive().parse(req.params.id);
  const input = episodeInput.parse(req.body);
  const [result] = await pool.execute(`INSERT INTO episodes
    (season_id, episode_number, title, description, duration_minutes, release_date,
      thumbnail_url, video_path, external_video_url, is_published, downloads_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [seasonId, input.episode_number, input.title, input.description || null,
    input.duration_minutes || null, input.release_date || null,
    req.files?.thumbnail?.[0] ? `/api/media/images/${req.files.thumbnail[0].filename}` : input.thumbnail_url || null,
    req.files?.video?.[0]?.filename || null, trustedMediaUrl(input.external_video_url),
    input.is_published || false,
    input.downloads_enabled || false]);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await saveVideoVariants(connection, 'episode_video_variants', 'episode_id', result.insertId, req.files);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  res.status(201).json({ id: result.insertId, season_id: seasonId, ...input });
}));

router.put('/episodes/:id', uploadContent, asyncHandler(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const input = episodeInput.parse(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existing]] = await connection.execute('SELECT id FROM episodes WHERE id = ? LIMIT 1', [id]);
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: 'Episode not found.' });
    }
    const [result] = await connection.execute(`UPDATE episodes SET episode_number = ?, title = ?,
      description = ?, duration_minutes = ?, release_date = ?, thumbnail_url = COALESCE(?, thumbnail_url),
      video_path = COALESCE(?, video_path), external_video_url = ?, is_published = ?,
      downloads_enabled = ? WHERE id = ?`,
  [input.episode_number, input.title, input.description || null, input.duration_minutes || null,
    input.release_date || null,
    req.files?.thumbnail?.[0] ? `/api/media/images/${req.files.thumbnail[0].filename}` : input.thumbnail_url || null,
    req.files?.video?.[0]?.filename || null, trustedMediaUrl(input.external_video_url),
    input.is_published || false,
      input.downloads_enabled || false, id]);
    await saveVideoVariants(connection, 'episode_video_variants', 'episode_id', id, req.files, true);
    await connection.commit();
    res.json({ id, ...input });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/episodes/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM episodes WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Episode not found.' });
  res.status(204).end();
}));

router.put('/episodes/:id/publish', asyncHandler(async (req, res) => {
  const isPublished = formBoolean.parse(req.body.is_published);
  const [result] = await pool.execute('UPDATE episodes SET is_published = ? WHERE id = ?',
    [isPublished, z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Episode not found.' });
  res.json({ is_published: isPublished });
}));

async function addSubtitle(req, res, mediaType) {
  const file = req.files?.subtitle?.[0];
  if (!file) return res.status(400).json({ error: 'Choose a WebVTT subtitle file.' });
  const input = z.object({
    language: z.string().trim().min(2).max(16).regex(/^[a-zA-Z0-9-]+$/),
    label: z.string().trim().min(1).max(80)
  }).parse(req.body);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const isMovie = mediaType === 'movie';
  const table = isMovie ? 'movies' : 'episodes';
  const [media] = await pool.execute(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  if (!media[0]) return res.status(404).json({ error: 'Content item not found.' });
  const [result] = await pool.execute(
    `INSERT INTO subtitles (${isMovie ? 'movie_id' : 'episode_id'}, language, label, file_path)
      VALUES (?, ?, ?, ?)`,
    [id, input.language, input.label, file.filename]
  );
  res.status(201).json({ id: result.insertId, language: input.language, label: input.label });
}

router.post('/movies/:id/subtitles', uploadContent, asyncHandler((req, res) => addSubtitle(req, res, 'movie')));
router.post('/episodes/:id/subtitles', uploadContent, asyncHandler((req, res) => addSubtitle(req, res, 'episode')));

router.delete('/subtitles/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM subtitles WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Subtitle not found.' });
  res.status(204).end();
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  }).parse(req.body);
  const [result] = await pool.execute('INSERT INTO categories (name, slug) VALUES (?, ?)',
    [input.name, input.slug]);
  res.status(201).json({ id: result.insertId, ...input });
}));

router.put('/categories/:id', asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  }).parse(req.body);
  await pool.execute('UPDATE categories SET name = ?, slug = ? WHERE id = ?',
    [input.name, input.slug, z.coerce.number().int().positive().parse(req.params.id)]);
  res.json(input);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM categories WHERE id = ?',
    [z.coerce.number().int().positive().parse(req.params.id)]);
  res.status(204).end();
}));

export default router;
