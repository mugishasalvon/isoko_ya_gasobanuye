CREATE DATABASE IF NOT EXISTS noirplay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE noirplay;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('member', 'admin') NOT NULL DEFAULT 'member',
  avatar_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subtitle_translators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(240) NOT NULL UNIQUE,
  bio TEXT NULL,
  image_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(240) NOT NULL,
  description TEXT NOT NULL,
  release_year SMALLINT UNSIGNED NULL,
  duration_minutes SMALLINT UNSIGNED NULL,
  rating DECIMAL(3,1) NOT NULL DEFAULT 0,
  age_rating VARCHAR(12) NULL,
  director VARCHAR(240) NULL,
  subtitle_translator_id BIGINT UNSIGNED NULL,
  subtitle_translator_name VARCHAR(240) NULL,
  subtitle_translator_image_url VARCHAR(1000) NULL,
  cast JSON NULL,
  poster_url VARCHAR(1000) NULL,
  banner_url VARCHAR(1000) NULL,
  video_path VARCHAR(1000) NULL,
  external_video_url VARCHAR(2000) NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  downloads_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  views BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_movies_published_release (is_published, release_year),
  INDEX idx_movies_views (views),
  CONSTRAINT fk_movies_subtitle_translator FOREIGN KEY (subtitle_translator_id)
    REFERENCES subtitle_translators(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS series (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(240) NOT NULL,
  description TEXT NOT NULL,
  release_year SMALLINT UNSIGNED NULL,
  rating DECIMAL(3,1) NOT NULL DEFAULT 0,
  subtitle_translator_id BIGINT UNSIGNED NULL,
  cast JSON NULL,
  poster_url VARCHAR(1000) NULL,
  banner_url VARCHAR(1000) NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_series_published_release (is_published, release_year),
  CONSTRAINT fk_series_subtitle_translator FOREIGN KEY (subtitle_translator_id)
    REFERENCES subtitle_translators(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS seasons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  series_id BIGINT UNSIGNED NOT NULL,
  season_number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(240) NULL,
  poster_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_series_season (series_id, season_number),
  CONSTRAINT fk_seasons_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  season_id BIGINT UNSIGNED NOT NULL,
  episode_number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(240) NOT NULL,
  description TEXT NULL,
  duration_minutes SMALLINT UNSIGNED NULL,
  thumbnail_url VARCHAR(1000) NULL,
  video_path VARCHAR(1000) NULL,
  external_video_url VARCHAR(2000) NULL,
  release_date DATE NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  downloads_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  views BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_season_episode (season_id, episode_number),
  INDEX idx_episodes_published (is_published, release_date),
  CONSTRAINT fk_episodes_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movie_video_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  movie_id BIGINT UNSIGNED NOT NULL,
  quality ENUM('480p', '720p', '1080p') NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  UNIQUE KEY uq_movie_video_quality (movie_id, quality),
  CONSTRAINT fk_movie_video_variant FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_video_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  episode_id BIGINT UNSIGNED NOT NULL,
  quality ENUM('480p', '720p', '1080p') NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  UNIQUE KEY uq_episode_video_quality (episode_id, quality),
  CONSTRAINT fk_episode_video_variant FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS movie_categories (
  movie_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (movie_id, category_id),
  CONSTRAINT fk_movie_categories_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_movie_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS series_categories (
  series_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (series_id, category_id),
  CONSTRAINT fk_series_categories_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  CONSTRAINT fk_series_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watch_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NULL,
  episode_id BIGINT UNSIGNED NULL,
  progress_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_movie_history (user_id, movie_id),
  UNIQUE KEY uq_user_episode_history (user_id, episode_id),
  INDEX idx_history_user_updated (user_id, updated_at),
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  CONSTRAINT chk_history_media CHECK ((movie_id IS NULL) <> (episode_id IS NULL))
);

CREATE TABLE IF NOT EXISTS watchlist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NULL,
  series_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_watchlist_movie (user_id, movie_id),
  UNIQUE KEY uq_watchlist_series (user_id, series_id),
  CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlist_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlist_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  CONSTRAINT chk_watchlist_media CHECK ((movie_id IS NULL) <> (series_id IS NULL))
);

CREATE TABLE IF NOT EXISTS downloads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NULL,
  episode_id BIGINT UNSIGNED NULL,
  quality ENUM('original', '480p', '720p', '1080p') NOT NULL DEFAULT 'original',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_downloads_user_date (user_id, created_at),
  CONSTRAINT fk_downloads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_downloads_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_downloads_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  CONSTRAINT chk_downloads_media CHECK ((movie_id IS NULL) <> (episode_id IS NULL))
);

CREATE TABLE IF NOT EXISTS ratings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NULL,
  series_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating_movie (user_id, movie_id),
  UNIQUE KEY uq_rating_series (user_id, series_id),
  CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_series FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  CONSTRAINT chk_ratings_media CHECK ((movie_id IS NULL) <> (series_id IS NULL)),
  CONSTRAINT chk_ratings_value CHECK (rating BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS subtitles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  movie_id BIGINT UNSIGNED NULL,
  episode_id BIGINT UNSIGNED NULL,
  language VARCHAR(16) NOT NULL,
  label VARCHAR(80) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  CONSTRAINT fk_subtitles_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_subtitles_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  CONSTRAINT chk_subtitles_media CHECK ((movie_id IS NULL) <> (episode_id IS NULL))
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  movie_id BIGINT UNSIGNED NULL,
  episode_id BIGINT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comments_movie (movie_id, created_at),
  INDEX idx_comments_episode (episode_id, created_at),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  CONSTRAINT chk_comments_media CHECK ((movie_id IS NULL) <> (episode_id IS NULL))
);

INSERT IGNORE INTO categories (name, slug) VALUES
  ('Action', 'action'), ('Adventure', 'adventure'), ('Comedy', 'comedy'),
  ('Drama', 'drama'), ('Horror', 'horror'), ('Romance', 'romance'),
  ('Thriller', 'thriller'), ('Science Fiction', 'science-fiction'),
  ('Animation', 'animation'), ('Documentary', 'documentary'),
  ('Fantasy', 'fantasy'), ('Crime', 'crime');
