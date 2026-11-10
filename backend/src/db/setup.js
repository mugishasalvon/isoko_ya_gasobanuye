import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const database = config.database.database;

if (!/^[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
}

const connection = await mysql.createConnection({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  multipleStatements: true
});

try {
  await connection.query(schema.replaceAll('noirplay', database));
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'movies'
        AND COLUMN_NAME IN ('subtitle_translator_id', 'subtitle_translator_name', 'subtitle_translator_image_url')`,
    [database]
  );
  const existingColumns = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existingColumns.has('subtitle_translator_name')) {
    await connection.query(
      `ALTER TABLE \`${database}\`.movies ADD COLUMN subtitle_translator_name VARCHAR(240) NULL`
    );
  }
  if (!existingColumns.has('subtitle_translator_image_url')) {
    await connection.query(
      `ALTER TABLE \`${database}\`.movies ADD COLUMN subtitle_translator_image_url VARCHAR(1000) NULL`
    );
  }
  if (!existingColumns.has('subtitle_translator_id')) {
    await connection.query(
      `ALTER TABLE \`${database}\`.movies ADD COLUMN subtitle_translator_id BIGINT UNSIGNED NULL`
    );
  }
  const [constraints] = await connection.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'movies'
        AND CONSTRAINT_NAME = 'fk_movies_subtitle_translator'`,
    [database]
  );
  if (!constraints.length) {
    await connection.query(
      `ALTER TABLE \`${database}\`.movies
        ADD CONSTRAINT fk_movies_subtitle_translator
        FOREIGN KEY (subtitle_translator_id) REFERENCES subtitle_translators(id) ON DELETE RESTRICT`
    );
  }
  const [seriesColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'series'
        AND COLUMN_NAME = 'subtitle_translator_id'`,
    [database]
  );
  if (!seriesColumns.length) {
    await connection.query(
      `ALTER TABLE \`${database}\`.series ADD COLUMN subtitle_translator_id BIGINT UNSIGNED NULL`
    );
  }
  const [seriesConstraints] = await connection.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'series'
        AND CONSTRAINT_NAME = 'fk_series_subtitle_translator'`,
    [database]
  );
  if (!seriesConstraints.length) {
    await connection.query(
      `ALTER TABLE \`${database}\`.series
        ADD CONSTRAINT fk_series_subtitle_translator
        FOREIGN KEY (subtitle_translator_id) REFERENCES subtitle_translators(id) ON DELETE RESTRICT`
    );
  }
  const [seasonColumns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'seasons' AND COLUMN_NAME = 'poster_url'`,
    [database]
  );
  if (!seasonColumns.length) {
    await connection.query(
      `ALTER TABLE \`${database}\`.seasons ADD COLUMN poster_url VARCHAR(1000) NULL`
    );
  }
  await connection.query(`INSERT IGNORE INTO \`${database}\`.subtitle_translators (name, image_url)
    SELECT TRIM(subtitle_translator_name), MAX(NULLIF(subtitle_translator_image_url, ''))
    FROM \`${database}\`.movies
    WHERE subtitle_translator_name IS NOT NULL AND TRIM(subtitle_translator_name) <> ''
    GROUP BY TRIM(subtitle_translator_name)`);
  await connection.query(`UPDATE \`${database}\`.movies m
    JOIN \`${database}\`.subtitle_translators t ON t.name = TRIM(m.subtitle_translator_name)
    SET m.subtitle_translator_id = t.id,
      m.subtitle_translator_name = NULL,
      m.subtitle_translator_image_url = NULL
    WHERE m.subtitle_translator_id IS NULL
      AND m.subtitle_translator_name IS NOT NULL
      AND TRIM(m.subtitle_translator_name) <> ''`);
  await connection.query(`CREATE TABLE IF NOT EXISTS \`${database}\`.comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    guest_name VARCHAR(100) NOT NULL DEFAULT '',
    guest_email VARCHAR(254) NOT NULL DEFAULT '',
    movie_id BIGINT UNSIGNED NULL,
    episode_id BIGINT UNSIGNED NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comments_movie (movie_id, created_at),
    INDEX idx_comments_episode (episode_id, created_at),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_comments_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    CONSTRAINT chk_comments_media CHECK ((movie_id IS NULL) <> (episode_id IS NULL))
  )`);
  const [commentColumns] = await connection.execute(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'comments'
        AND COLUMN_NAME IN ('user_id', 'guest_name', 'guest_email')`,
    [database]
  );
  const commentColumnMap = new Map(commentColumns.map((col) => [col.COLUMN_NAME, col.IS_NULLABLE]));
  if (!commentColumnMap.has('guest_name')) {
    await connection.query(`ALTER TABLE \`${database}\`.comments ADD COLUMN guest_name VARCHAR(100) NOT NULL DEFAULT ''`);
  }
  if (!commentColumnMap.has('guest_email')) {
    await connection.query(`ALTER TABLE \`${database}\`.comments ADD COLUMN guest_email VARCHAR(254) NOT NULL DEFAULT ''`);
  }
  if (commentColumnMap.get('user_id') === 'NO') {
    await connection.query(`ALTER TABLE \`${database}\`.comments DROP FOREIGN KEY fk_comments_user`);
    await connection.query(`ALTER TABLE \`${database}\`.comments MODIFY user_id BIGINT UNSIGNED NULL`);
    await connection.query(`ALTER TABLE \`${database}\`.comments ADD CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`);
  }
  console.log(`Database schema is ready: ${database}`);
} finally {
  await connection.end();
}
