import { pool } from './pool.js';

const movies = [
  {
    slug: 'after-the-blue-hour',
    title: 'After the Blue Hour',
    description: 'A deep-space cartographer discovers an impossible signal at the edge of a forgotten star map and must choose between the mission she was sent to complete and the lives that depend on her return.',
    year: 2026, minutes: 124, rating: 8.4, director: 'Mara Voss',
    cast: ['Ilya Rowan', 'Nadia Wells', 'Sol Kim'], categories: ['science-fiction', 'adventure'],
    poster: 'photo-1462331940025-496dfbfc7564',
    banner: 'photo-1534796636912-3b95b3ab5986'
  },
  {
    slug: 'the-last-table',
    title: 'The Last Table',
    description: 'On the final night of a beloved neighborhood restaurant, three generations of one family gather for a dinner that changes everything they thought they knew about home.',
    year: 2025, minutes: 108, rating: 7.9, director: 'Elias Hart',
    cast: ['Ren Ito', 'Maya Bell', 'Jonah Price'], categories: ['drama', 'comedy'],
    poster: 'photo-1517248135467-4c7edcad34c4',
    banner: 'photo-1517248135467-4c7edcad34c4'
  },
  {
    slug: 'quiet-city',
    title: 'Quiet City',
    description: 'A night-shift radio producer and a midnight taxi driver begin leaving messages for one another on the city frequency, slowly changing the shape of two very different lives.',
    year: 2025, minutes: 116, rating: 8.1, director: 'Ari Lennox',
    cast: ['Sam Rivera', 'Leah Okafor', 'Theo Park'], categories: ['romance', 'drama'],
    poster: 'photo-1519608487953-e999c86e7455',
    banner: 'photo-1519608487953-e999c86e7455'
  },
  {
    slug: 'northbound',
    title: 'Northbound',
    description: 'A mountain rescue team races an approaching storm to reach a stranded climber and uncovers a secret buried beneath the snow.',
    year: 2024, minutes: 101, rating: 7.6, director: 'Noah Mercer',
    cast: ['Luca Hayes', 'Mina Solberg', 'Eden Clark'], categories: ['thriller', 'adventure'],
    poster: 'photo-1464822759023-fed622ff2c3b',
    banner: 'photo-1464822759023-fed622ff2c3b'
  }
];

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  for (const movie of movies) {
    const [existing] = await connection.execute('SELECT id FROM movies WHERE slug = ?', [movie.slug]);
    if (existing[0]) continue;
    const [result] = await connection.execute(`INSERT INTO movies
      (slug, title, description, release_year, duration_minutes, rating, director, cast,
        poster_url, banner_url, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [movie.slug, movie.title, movie.description, movie.year, movie.minutes, movie.rating,
      movie.director, JSON.stringify(movie.cast),
      `https://images.unsplash.com/${movie.poster}?auto=format&fit=crop&w=700&q=85`,
      `https://images.unsplash.com/${movie.banner}?auto=format&fit=crop&w=1920&q=85`]);
    for (const slug of movie.categories) {
      const [[category]] = await connection.execute('SELECT id FROM categories WHERE slug = ?', [slug]);
      if (category) {
        await connection.execute('INSERT IGNORE INTO movie_categories (movie_id, category_id) VALUES (?, ?)',
          [result.insertId, category.id]);
      }
    }
  }
  await connection.commit();
  console.log('Fictional local-development catalogue added (existing entries were left unchanged).');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
