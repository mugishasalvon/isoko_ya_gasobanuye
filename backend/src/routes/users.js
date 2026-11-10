import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.put('/profile', asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    current_password: z.string().min(8).max(72).optional(),
    new_password: z.string().min(8).max(72).optional()
  }).refine((value) => !value.new_password || value.current_password, {
    message: 'Enter your current password before setting a new one.'
  }).parse(req.body);
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Account no longer exists.' });
  let passwordHash;
  if (input.new_password) {
    if (!(await bcrypt.compare(input.current_password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    passwordHash = await bcrypt.hash(input.new_password, 12);
  }
  if (passwordHash) {
    await pool.execute('UPDATE users SET name = ?, password_hash = ? WHERE id = ?',
      [input.name, passwordHash, req.user.id]);
  } else {
    await pool.execute('UPDATE users SET name = ? WHERE id = ?', [input.name, req.user.id]);
  }
  const [updated] = await pool.execute(
    'SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  res.json({ user: updated[0] });
}));

router.post('/ratings', asyncHandler(async (req, res) => {
  const input = z.object({
    type: z.enum(['movie', 'series']),
    id: z.coerce.number().int().positive(),
    rating: z.coerce.number().int().min(1).max(10)
  }).parse(req.body);
  const isMovie = input.type === 'movie';
  const table = isMovie ? 'movies' : 'series';
  const column = isMovie ? 'movie_id' : 'series_id';
  const [content] = await pool.execute(`SELECT id FROM ${table} WHERE id = ? AND is_published = TRUE LIMIT 1`,
    [input.id]);
  if (!content[0]) return res.status(404).json({ error: 'Published title not found.' });
  await pool.execute(`INSERT INTO ratings (user_id, ${column}, rating) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
  [req.user.id, input.id, input.rating]);
  await pool.execute(`UPDATE ${table} SET rating = (SELECT AVG(rating) FROM ratings WHERE ${column} = ?)
    WHERE id = ?`, [input.id, input.id]);
  const [[summary]] = await pool.execute(
    `SELECT ROUND(AVG(rating), 1) AS rating, COUNT(*) AS rating_count
      FROM ratings WHERE ${column} = ?`, [input.id]
  );
  res.json(summary);
}));

router.get('/ratings/:type/:id', asyncHandler(async (req, res) => {
  const type = z.enum(['movie', 'series']).parse(req.params.type);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const column = type === 'movie' ? 'movie_id' : 'series_id';
  const [rows] = await pool.execute(
    `SELECT rating FROM ratings WHERE user_id = ? AND ${column} = ? LIMIT 1`,
    [req.user.id, id]
  );
  res.json({ rating: rows[0]?.rating || null });
}));

router.get('/watchlist', asyncHandler(async (req, res) => {
  const [items] = await pool.execute(`SELECT wl.id, wl.created_at,
    m.id AS movie_id, m.slug AS movie_slug, m.title AS movie_title, m.poster_url AS movie_poster,
    m.subtitle_translator_name AS movie_subtitle_translator_name,
    m.subtitle_translator_image_url AS movie_subtitle_translator_image_url,
    s.id AS series_id, s.slug AS series_slug, s.title AS series_title, s.poster_url AS series_poster
    FROM watchlist wl
    LEFT JOIN movies m ON m.id = wl.movie_id
    LEFT JOIN series s ON s.id = wl.series_id
    WHERE wl.user_id = ? ORDER BY wl.created_at DESC`, [req.user.id]);
  res.json({ items });
}));

router.post('/watchlist', asyncHandler(async (req, res) => {
  const input = z.object({
    type: z.enum(['movie', 'series']),
    id: z.coerce.number().int().positive()
  }).parse(req.body);
  const [result] = await pool.execute(
    `INSERT IGNORE INTO watchlist (user_id, movie_id, series_id) VALUES (?, ?, ?)`,
    [req.user.id, input.type === 'movie' ? input.id : null, input.type === 'series' ? input.id : null]
  );
  res.status(result.affectedRows ? 201 : 200).json({ saved: true });
}));

router.delete('/watchlist/:type/:id', asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!['movie', 'series'].includes(type)) return res.status(400).json({ error: 'Invalid content type.' });
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const column = type === 'movie' ? 'movie_id' : 'series_id';
  await pool.execute(`DELETE FROM watchlist WHERE user_id = ? AND ${column} = ?`, [req.user.id, id]);
  res.status(204).end();
}));

router.get('/history', asyncHandler(async (req, res) => {
  const [items] = await pool.execute(`SELECT h.id, h.movie_id, h.episode_id, h.progress_seconds,
    h.duration_seconds, h.updated_at, m.title AS movie_title, m.slug AS movie_slug,
    m.poster_url AS movie_poster,
    m.subtitle_translator_name AS movie_subtitle_translator_name,
    m.subtitle_translator_image_url AS movie_subtitle_translator_image_url,
    e.title AS episode_title, e.thumbnail_url AS episode_poster,
    se.season_number, sr.title AS series_title, sr.slug AS series_slug
    FROM watch_history h
    LEFT JOIN movies m ON m.id = h.movie_id
    LEFT JOIN episodes e ON e.id = h.episode_id
    LEFT JOIN seasons se ON se.id = e.season_id
    LEFT JOIN series sr ON sr.id = se.series_id
    WHERE h.user_id = ? ORDER BY h.updated_at DESC LIMIT 50`, [req.user.id]);
  res.json({ items });
}));

router.put('/history', asyncHandler(async (req, res) => {
  const input = z.object({
    movie_id: z.number().int().positive().optional(),
    episode_id: z.number().int().positive().optional(),
    progress_seconds: z.number().int().nonnegative(),
    duration_seconds: z.number().int().positive()
  }).refine((value) => Boolean(value.movie_id) !== Boolean(value.episode_id), {
    message: 'Provide exactly one movie_id or episode_id.'
  }).parse(req.body);
  const mediaColumn = input.movie_id ? 'movie_id' : 'episode_id';
  const mediaId = input.movie_id || input.episode_id;
  await pool.execute(`INSERT INTO watch_history
    (user_id, movie_id, episode_id, progress_seconds, duration_seconds)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE progress_seconds = VALUES(progress_seconds),
      duration_seconds = VALUES(duration_seconds), updated_at = CURRENT_TIMESTAMP`,
  [req.user.id, input.movie_id || null, input.episode_id || null,
    Math.min(input.progress_seconds, input.duration_seconds), input.duration_seconds]);
  res.json({ saved: true, [mediaColumn]: mediaId });
}));

router.get('/downloads', asyncHandler(async (req, res) => {
  const [items] = await pool.execute(`SELECT d.id, d.quality, d.created_at, m.title AS movie_title,
    e.title AS episode_title, s.title AS series_title
    FROM downloads d LEFT JOIN movies m ON m.id = d.movie_id
    LEFT JOIN episodes e ON e.id = d.episode_id
    LEFT JOIN seasons se ON se.id = e.season_id
    LEFT JOIN series s ON s.id = se.series_id
    WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ items });
}));

export default router;
