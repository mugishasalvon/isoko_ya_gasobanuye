import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { withEpisodeRelations, withMovieRelations, withSeriesGenres } from '../lib/content-relations.js';

const router = Router();
const movieFields = `m.id, m.slug, m.title, m.description, m.release_year, m.duration_minutes,
  m.rating, m.age_rating, m.director, m.subtitle_translator_id,
  COALESCE((SELECT t.name FROM subtitle_translators t WHERE t.id = m.subtitle_translator_id),
    m.subtitle_translator_name) AS subtitle_translator_name,
  COALESCE((SELECT t.image_url FROM subtitle_translators t WHERE t.id = m.subtitle_translator_id),
    m.subtitle_translator_image_url) AS subtitle_translator_image_url,
  m.cast, m.poster_url, m.banner_url, m.is_published,
  m.downloads_enabled, m.views, m.created_at`;

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(40, Math.max(1, Number.parseInt(query.limit, 10) || 24));
  return { page, limit, offset: (page - 1) * limit };
}

function safeJson(value) {
  if (typeof value !== 'string') return value || [];
  try { return JSON.parse(value); } catch { return []; }
}

router.get('/featured', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`SELECT ${movieFields}
    FROM movies m WHERE m.is_published = TRUE
    ORDER BY m.release_year DESC, m.created_at DESC LIMIT 5`);
  res.json({ items: rows.map((row) => ({ ...row, cast: safeJson(row.cast) })) });
}));

router.get('/catalog', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const category = String(req.query.category || '').trim().slice(0, 100);
  const orderings = {
    latest: 'content.created_at DESC, content.id DESC',
    trending: 'content.views DESC, content.created_at DESC, content.id DESC',
    popular: 'content.views DESC, content.created_at DESC, content.id DESC',
    top: 'content.rating DESC, content.views DESC, content.created_at DESC'
  };
  const order = orderings[req.query.sort] || orderings.latest;
  const movieCategory = category ? `AND EXISTS (
    SELECT 1 FROM movie_categories mc JOIN categories c ON c.id = mc.category_id
    WHERE mc.movie_id = m.id AND c.slug = ?
  )` : '';
  const seasonCategory = category ? `AND EXISTS (
    SELECT 1 FROM series_categories sc JOIN categories c ON c.id = sc.category_id
    WHERE sc.series_id = sr.id AND c.slug = ?
  )` : '';
  const categoryParams = category ? [category, category] : [];
  const [items] = await pool.execute(`SELECT content.* FROM (
    SELECT m.id, m.slug, m.title, m.description, m.release_year, m.duration_minutes,
      m.rating, m.age_rating, m.director, m.poster_url, m.banner_url, m.created_at,
      m.views, NULL AS series_id, NULL AS season_number, 'movie' AS content_type,
      COALESCE(t.name, m.subtitle_translator_name) AS subtitle_translator_name,
      COALESCE(t.image_url, m.subtitle_translator_image_url) AS subtitle_translator_image_url,
      NULL AS genres
    FROM movies m LEFT JOIN subtitle_translators t ON t.id = m.subtitle_translator_id
    WHERE m.is_published = TRUE ${movieCategory}
    UNION ALL
    SELECT se.id, sr.slug,
      CONCAT(sr.title, ' · ', COALESCE(se.title, CONCAT('Season ', se.season_number))) AS title,
      sr.description, sr.release_year, NULL AS duration_minutes, sr.rating,
      NULL AS age_rating, NULL AS director, COALESCE(se.poster_url, sr.poster_url) AS poster_url,
      sr.banner_url, se.created_at,
      COALESCE((SELECT SUM(e.views) FROM episodes e
        WHERE e.season_id = se.id AND e.is_published = TRUE), 0) AS views,
      sr.id AS series_id, se.season_number, 'season' AS content_type,
      t.name AS subtitle_translator_name, t.image_url AS subtitle_translator_image_url,
      NULL AS genres
    FROM seasons se JOIN series sr ON sr.id = se.series_id
    LEFT JOIN subtitle_translators t ON t.id = sr.subtitle_translator_id
    WHERE sr.is_published = TRUE ${seasonCategory}
  ) AS content
  ORDER BY ${order} LIMIT ? OFFSET ?`, [...categoryParams, limit, offset]);
  const movieIds = items.filter((item) => item.content_type === 'movie').map((item) => item.id);
  const seriesIds = [...new Set(items.filter((item) => item.content_type === 'season').map((item) => item.series_id))];
  const [movieGenres, seriesGenres] = await Promise.all([
    movieIds.length ? pool.execute(`SELECT mc.movie_id AS content_id, c.name FROM movie_categories mc
      JOIN categories c ON c.id = mc.category_id WHERE mc.movie_id IN (${movieIds.map(() => '?').join(',')})`,
    movieIds) : [[]],
    seriesIds.length ? pool.execute(`SELECT sc.series_id AS content_id, c.name FROM series_categories sc
      JOIN categories c ON c.id = sc.category_id WHERE sc.series_id IN (${seriesIds.map(() => '?').join(',')})`,
    seriesIds) : [[]]
  ]);
  const genreMap = new Map();
  for (const row of movieGenres[0]) {
    const key = `movie-${row.content_id}`;
    genreMap.set(key, [...(genreMap.get(key) || []), row.name]);
  }
  for (const row of seriesGenres[0]) {
    const key = `series-${row.content_id}`;
    genreMap.set(key, [...(genreMap.get(key) || []), row.name]);
  }
  for (const item of items) {
    item.genres = genreMap.get(item.content_type === 'movie'
      ? `movie-${item.id}`
      : `series-${item.series_id}`) || [];
  }
  const [[{ total }]] = await pool.execute(`SELECT
    (SELECT COUNT(*) FROM movies m WHERE m.is_published = TRUE ${movieCategory}) +
    (SELECT COUNT(*) FROM seasons se JOIN series sr ON sr.id = se.series_id
      WHERE sr.is_published = TRUE ${seasonCategory}) AS total`, categoryParams);
  res.json({ items, page, limit, total });
}));

router.get('/home', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const [items] = await pool.execute(`SELECT content.* FROM (
    SELECT m.id, m.slug, m.title, m.description, m.release_year, m.duration_minutes,
      m.rating, m.age_rating, m.director, m.poster_url, m.banner_url, m.created_at,
      'movie' AS content_type,
      COALESCE(t.name, m.subtitle_translator_name) AS subtitle_translator_name,
      COALESCE(t.image_url, m.subtitle_translator_image_url) AS subtitle_translator_image_url
    FROM movies m LEFT JOIN subtitle_translators t ON t.id = m.subtitle_translator_id
    WHERE m.is_published = TRUE
    UNION ALL
    SELECT s.id, s.slug, s.title, s.description, s.release_year, NULL AS duration_minutes,
      s.rating, NULL AS age_rating, NULL AS director, s.poster_url, s.banner_url, s.created_at,
      'series' AS content_type, t.name AS subtitle_translator_name,
      t.image_url AS subtitle_translator_image_url
    FROM series s LEFT JOIN subtitle_translators t ON t.id = s.subtitle_translator_id
    WHERE s.is_published = TRUE
  ) AS content
  ORDER BY content.created_at DESC, content.id DESC
  LIMIT ? OFFSET ?`, [limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM movies WHERE is_published = TRUE) +
    (SELECT COUNT(*) FROM series WHERE is_published = TRUE) AS total`);
  res.json({ items, page, limit, total });
}));

router.get('/suggestions', asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  if (query.length < 2) return res.json({ items: [] });
  const term = `%${query}%`;
  const [movies, series, categories] = await Promise.all([
    pool.execute(`SELECT m.id, m.slug, m.title,
      COALESCE(t.name, m.subtitle_translator_name) AS subtitle_translator_name, m.director
      FROM movies m LEFT JOIN subtitle_translators t ON t.id = m.subtitle_translator_id
      WHERE m.is_published = TRUE AND (
        m.title LIKE ? OR m.description LIKE ? OR t.name LIKE ? OR m.subtitle_translator_name LIKE ?
        OR m.director LIKE ? OR CAST(m.cast AS CHAR) LIKE ?
        OR EXISTS (SELECT 1 FROM movie_categories mc JOIN categories c ON c.id = mc.category_id
          WHERE mc.movie_id = m.id AND c.name LIKE ?)
      ) ORDER BY m.created_at DESC LIMIT 3`,
    [term, term, term, term, term, term, term]),
    pool.execute(`SELECT s.id, s.slug, s.title FROM series s
      WHERE s.is_published = TRUE AND (
        s.title LIKE ? OR s.description LIKE ? OR CAST(s.cast AS CHAR) LIKE ?
        OR EXISTS (SELECT 1 FROM series_categories sc JOIN categories c ON c.id = sc.category_id
          WHERE sc.series_id = s.id AND c.name LIKE ?)
        OR EXISTS (SELECT 1 FROM seasons se JOIN episodes e ON e.season_id = se.id
          WHERE se.series_id = s.id AND e.is_published = TRUE
            AND (e.title LIKE ? OR e.description LIKE ?))
      ) ORDER BY s.release_year DESC LIMIT 3`,
    [term, term, term, term, term, term]),
    pool.execute('SELECT slug, name FROM categories WHERE name LIKE ? ORDER BY name LIMIT 2', [term])
  ]);
  const normalizedQuery = query.toLocaleLowerCase();
  const items = [
    ...movies[0].map((movie) => ({
      type: 'movie',
      label: movie.title,
      detail: movie.subtitle_translator_name
        && movie.subtitle_translator_name.toLocaleLowerCase().includes(normalizedQuery)
        ? `Subtitles by ${movie.subtitle_translator_name}`
        : movie.director && movie.director.toLocaleLowerCase().includes(normalizedQuery)
          ? `Directed by ${movie.director}`
          : 'Movie',
      href: `/movies/${movie.slug}`
    })),
    ...series[0].map((show) => ({
      type: 'series',
      label: show.title,
      detail: 'Series',
      href: `/series/${show.slug}`
    })),
    ...categories[0].map((category) => ({
      type: 'category',
      label: category.name,
      detail: 'Category',
      href: `/categories/${category.slug}`
    }))
  ].slice(0, 8);
  res.json({ items });
}));

router.get('/movies', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const search = String(req.query.search || '').trim().slice(0, 100);
  const category = String(req.query.category || '').trim().slice(0, 100);
  const orderings = {
    latest: 'm.created_at DESC',
    trending: 'm.views DESC, m.created_at DESC',
    top: 'm.rating DESC, m.views DESC',
    popular: 'm.views DESC, m.rating DESC'
  };
  const order = orderings[req.query.sort] || orderings.latest;
  const where = ['m.is_published = TRUE'];
  const params = [];
  if (search) {
    where.push(`(m.title LIKE ? OR m.description LIKE ?
      OR COALESCE(m.subtitle_translator_name,
        (SELECT t.name FROM subtitle_translators t WHERE t.id = m.subtitle_translator_id)) LIKE ?
      OR m.director LIKE ? OR CAST(m.cast AS CHAR) LIKE ?
      OR EXISTS (SELECT 1 FROM movie_categories mc JOIN categories c ON c.id = mc.category_id
        WHERE mc.movie_id = m.id AND c.name LIKE ?))`);
    params.push(...Array(6).fill(`%${search}%`));
  }
  if (category) {
    where.push(`EXISTS (
      SELECT 1 FROM movie_categories mc JOIN categories c ON c.id = mc.category_id
      WHERE mc.movie_id = m.id AND c.slug = ?
    )`);
    params.push(category);
  }
  const [rows] = await pool.execute(`SELECT ${movieFields}
    FROM movies m WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
  [...params, limit, offset]);
  const items = await withMovieRelations(rows);
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM movies m WHERE ${where.join(' AND ')}`,
    params
  );
  res.json({
    items: items.map((item) => ({
      ...item,
      cast: safeJson(item.cast),
      genres: item.genres,
      download_qualities: item.download_qualities,
      subtitles: item.subtitles
    })),
    page,
    limit,
    total
  });
}));

router.get('/movies/:slug', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${movieFields}
    FROM movies m WHERE m.slug = ? AND m.is_published = TRUE LIMIT 1`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: 'Movie not found.' });
  const [movie] = await withMovieRelations(rows);
  await pool.execute('UPDATE movies SET views = views + 1 WHERE id = ?', [movie.id]);
  const [related] = await pool.execute(`SELECT DISTINCT ${movieFields}
    FROM movies m JOIN movie_categories mc ON mc.movie_id = m.id
    WHERE m.id <> ? AND m.is_published = TRUE AND mc.category_id IN
      (SELECT category_id FROM movie_categories WHERE movie_id = ?)
    ORDER BY m.rating DESC LIMIT 8`, [movie.id, movie.id]);
  res.json({
    item: {
      ...movie,
      cast: safeJson(movie.cast)
    },
    related: related.map((item) => ({ ...item, cast: safeJson(item.cast) }))
  });
}));

router.get('/movies/id/:id', asyncHandler(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid movie ID.' });
  const [rows] = await pool.execute(`SELECT ${movieFields}
    FROM movies m WHERE m.id = ? AND m.is_published = TRUE LIMIT 1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Movie not found.' });
  const [movie] = await withMovieRelations(rows);
  await pool.execute('UPDATE movies SET views = views + 1 WHERE id = ?', [id]);
  res.json({ item: { ...movie, cast: safeJson(movie.cast) } });
}));

router.get('/series', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const search = String(req.query.search || '').trim().slice(0, 100);
  const conditions = ['s.is_published = TRUE'];
  const params = [];
  if (search) {
    conditions.push(`(s.title LIKE ? OR s.description LIKE ? OR CAST(s.cast AS CHAR) LIKE ?
      OR EXISTS (SELECT 1 FROM series_categories sc JOIN categories c ON c.id = sc.category_id
        WHERE sc.series_id = s.id AND c.name LIKE ?)
      OR EXISTS (SELECT 1 FROM seasons se JOIN episodes e ON e.season_id = se.id
        WHERE se.series_id = s.id AND e.is_published = TRUE
          AND (e.title LIKE ? OR e.description LIKE ?)))`);
    params.push(...Array(6).fill(`%${search}%`));
  }
  const [rows] = await pool.execute(`SELECT s.id, s.slug, s.title, s.description, s.release_year,
    s.rating, s.poster_url, s.banner_url, s.cast,
    (SELECT COUNT(*) FROM seasons se WHERE se.series_id = s.id) AS season_count,
    (SELECT COUNT(*) FROM episodes e JOIN seasons se ON se.id = e.season_id
      WHERE se.series_id = s.id AND e.is_published = TRUE) AS episode_count
    FROM series s WHERE ${conditions.join(' AND ')} ORDER BY s.release_year DESC LIMIT ? OFFSET ?`,
  [...params, limit, offset]);
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM series s WHERE ${conditions.join(' AND ')}`,
    params
  );
  const items = await withSeriesGenres(rows);
  res.json({ items: items.map((item) => ({
    ...item, cast: safeJson(item.cast)
  })), page, limit, total });
}));

router.get('/series/:slug', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT s.id, s.slug, s.title, s.description, s.release_year,
    s.rating, s.poster_url, s.banner_url, s.cast, t.name AS subtitle_translator_name,
    t.image_url AS subtitle_translator_image_url
    FROM series s LEFT JOIN subtitle_translators t ON t.id = s.subtitle_translator_id
    WHERE s.slug = ? AND s.is_published = TRUE LIMIT 1`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: 'Series not found.' });
  const [series] = await withSeriesGenres(rows);
  const [seasons] = await pool.execute(`SELECT se.id, se.season_number, se.title, se.poster_url
    FROM seasons se WHERE se.series_id = ? ORDER BY se.season_number`, [rows[0].id]);
  const episodeGroups = [];
  for (const season of seasons) {
    const [episodes] = await pool.execute(`SELECT e.id, e.episode_number, e.title, e.description,
      e.duration_minutes, e.thumbnail_url, e.release_date, e.downloads_enabled, e.video_path,
      e.external_video_url
      FROM episodes e WHERE e.season_id = ? AND e.is_published = TRUE ORDER BY e.episode_number`,
    [season.id]);
    episodeGroups.push(episodes);
  }
  const episodes = await withEpisodeRelations(episodeGroups.flat());
  let episodeIndex = 0;
  for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex += 1) {
    const season = seasons[seasonIndex];
    const episodeCount = episodeGroups[seasonIndex].length;
    season.episodes = episodes.slice(episodeIndex, episodeIndex + episodeCount).map((episode) => {
      const { video_path: _videoPath, external_video_url: _externalVideoUrl, ...visibleEpisode } = episode;
      return visibleEpisode;
    });
    episodeIndex += episodeCount;
  }
  res.json({ item: {
    ...series, cast: safeJson(series.cast), seasons
  } });
}));

router.get('/episodes/:id', asyncHandler(async (req, res) => {
  const episodeId = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(episodeId) || episodeId < 1) {
    return res.status(400).json({ error: 'Invalid episode ID.' });
  }
  const [rows] = await pool.execute(`SELECT e.id, e.episode_number, e.title, e.description,
    e.duration_minutes, e.thumbnail_url, e.release_date, e.downloads_enabled,
    e.video_path, e.external_video_url,
    se.id AS season_id, se.season_number, sr.id AS series_id, sr.slug AS series_slug,
    sr.title AS series_title, sr.is_published AS series_published
    FROM episodes e JOIN seasons se ON se.id = e.season_id
    JOIN series sr ON sr.id = se.series_id
    WHERE e.id = ? AND e.is_published = TRUE AND sr.is_published = TRUE LIMIT 1`, [episodeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Episode not found.' });
  const [item] = await withEpisodeRelations(rows);
  const [next] = await pool.execute(`SELECT e.id, e.title FROM episodes e
    JOIN seasons se ON se.id = e.season_id
    WHERE se.series_id = ? AND e.is_published = TRUE
      AND (se.season_number > ? OR (se.season_number = ? AND e.episode_number > ?))
    ORDER BY se.season_number, e.episode_number LIMIT 1`,
  [item.series_id, item.season_number, item.season_number, item.episode_number]);
  await pool.execute('UPDATE episodes SET views = views + 1 WHERE id = ?', [episodeId]);
  const { video_path: _privatePath, external_video_url: _privateUrl, ...episode } = item;
  res.json({ item: {
    ...episode,
    subtitles: episode.subtitles,
    next_episode: next[0] || null
  } });
}));

router.get('/categories', asyncHandler(async (_req, res) => {
  const [items] = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ items });
}));

export default router;
