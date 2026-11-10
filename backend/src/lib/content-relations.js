import { pool } from '../db/pool.js';

function placeholders(ids) {
  return ids.map(() => '?').join(', ');
}

function createMap(ids, createValue) {
  return new Map(ids.map((id) => [String(id), createValue()]));
}

function sortQualities(qualities) {
  const order = ['480p', '720p', '1080p'];
  qualities.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export async function getMovieRelations(ids) {
  const relations = createMap(ids, () => ({
    genres: [],
    category_ids: [],
    download_qualities: [],
    subtitles: [],
    has_original: false
  }));
  if (!ids.length) return relations;

  const inClause = placeholders(ids);
  const [categories, variants, subtitles, originals] = await Promise.all([
    pool.execute(`SELECT mc.movie_id AS content_id, mc.category_id, c.name
      FROM movie_categories mc JOIN categories c ON c.id = mc.category_id
      WHERE mc.movie_id IN (${inClause})`, ids),
    pool.execute(`SELECT movie_id AS content_id, quality FROM movie_video_variants
      WHERE movie_id IN (${inClause})`, ids),
    pool.execute(`SELECT movie_id AS content_id, id, language, label FROM subtitles
      WHERE movie_id IN (${inClause}) AND movie_id IS NOT NULL`, ids),
    pool.execute(`SELECT id, (video_path IS NOT NULL OR external_video_url IS NOT NULL) AS has_original
      FROM movies WHERE id IN (${inClause})`, ids)
  ]);

  for (const row of categories[0]) {
    const relation = relations.get(String(row.content_id));
    relation.genres.push(row.name);
    relation.category_ids.push(row.category_id);
  }
  for (const row of variants[0]) {
    relations.get(String(row.content_id)).download_qualities.push(row.quality);
  }
  for (const row of subtitles[0]) {
    relations.get(String(row.content_id)).subtitles.push({
      id: row.id,
      language: row.language,
      label: row.label
    });
  }
  for (const row of originals[0]) {
    relations.get(String(row.id)).has_original = Boolean(row.has_original);
  }
  for (const relation of relations.values()) {
    sortQualities(relation.download_qualities);
    if (relation.has_original) relation.download_qualities.unshift('original');
    delete relation.has_original;
  }
  return relations;
}

export async function withMovieRelations(items) {
  const relations = await getMovieRelations(items.map((item) => item.id));
  return items.map((item) => {
    const relation = relations.get(String(item.id));
    return {
      ...item,
      genres: relation?.genres || [],
      download_qualities: relation?.download_qualities || [],
      subtitles: relation?.subtitles || []
    };
  });
}

export async function withSeriesGenres(items) {
  const relations = createMap(items.map((item) => item.id), () => []);
  if (!items.length) return items.map((item) => ({ ...item, genres: [] }));

  const ids = items.map((item) => item.id);
  const [rows] = await pool.execute(`SELECT sc.series_id AS content_id, c.name
    FROM series_categories sc JOIN categories c ON c.id = sc.category_id
    WHERE sc.series_id IN (${placeholders(ids)})`, ids);
  for (const row of rows) relations.get(String(row.content_id)).push(row.name);
  return items.map((item) => ({
    ...item,
    genres: relations.get(String(item.id))
  }));
}

export async function getSeriesCategoryIds(ids) {
  const categories = createMap(ids, () => []);
  if (!ids.length) return categories;

  const [rows] = await pool.execute(`SELECT series_id AS content_id, category_id
    FROM series_categories WHERE series_id IN (${placeholders(ids)})`, ids);
  for (const row of rows) categories.get(String(row.content_id)).push(row.category_id);
  return categories;
}

export async function withEpisodeRelations(items) {
  const relations = createMap(items.map((item) => item.id), () => ({
    download_qualities: [],
    subtitles: [],
    has_original: false
  }));
  if (!items.length) return items.map((item) => ({
    ...item,
    download_qualities: [],
    subtitles: []
  }));

  const ids = items.map((item) => item.id);
  const inClause = placeholders(ids);
  const [variants, subtitles, originals] = await Promise.all([
    pool.execute(`SELECT episode_id AS content_id, quality FROM episode_video_variants
      WHERE episode_id IN (${inClause})`, ids),
    pool.execute(`SELECT episode_id AS content_id, id, language, label FROM subtitles
      WHERE episode_id IN (${inClause}) AND episode_id IS NOT NULL`, ids),
    pool.execute(`SELECT id, (video_path IS NOT NULL OR external_video_url IS NOT NULL) AS has_original
      FROM episodes WHERE id IN (${inClause})`, ids)
  ]);

  for (const row of variants[0]) {
    relations.get(String(row.content_id)).download_qualities.push(row.quality);
  }
  for (const row of subtitles[0]) {
    relations.get(String(row.content_id)).subtitles.push({
      id: row.id,
      language: row.language,
      label: row.label
    });
  }
  for (const row of originals[0]) {
    relations.get(String(row.id)).has_original = Boolean(row.has_original);
  }

  return items.map((item) => {
    const relation = relations.get(String(item.id));
    sortQualities(relation.download_qualities);
    if (relation.has_original) relation.download_qualities.unshift('original');
    const { has_original: _hasOriginal, ...visibleRelations } = relation;
    return { ...item, ...visibleRelations };
  });
}
