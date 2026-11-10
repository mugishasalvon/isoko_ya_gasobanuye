# iSOKO Y' AGASOBANUYE

iSOKO Y' AGASOBANUYE is a full-stack streaming catalogue built with React, Vite, Express, and MySQL/MariaDB. The frontend consumes a REST API; catalogue data lives in the database, and uploaded media is stored in private backend storage and served through API routes.

## Requirements

- Node.js 20.19+ and npm
- MySQL 8+ or MariaDB 10.4+

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set database credentials plus a long random `JWT_SECRET`.
2. Run `npm install` from the project root.
3. Create or update database tables with `npm run db:setup` (rerun after updates to apply compatible schema changes, including comments).
4. Create or update an administrator account: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`, then run `npm run admin:create -w backend`. Use a strong unique password (12+ characters). If the email already exists, the account is promoted and its password is updated.
5. Optionally add local development sample data with `npm run seed`.
6. Start the apps with `npm run dev`.

Vite runs at `http://localhost:5173` and the API at `http://localhost:4000` by default. Configure `CLIENT_ORIGIN` and `VITE_API_URL` for different addresses. Health check: `GET /api/health`.

## Features & notes

- **Admin-only sign-in:** public registration is disabled. Only administrators can sign in (`/login` / `POST /api/auth/login`). No default credentials are shipped.
- **Public viewing:** published movies, series, seasons, and episodes can be browsed and watched without a regular user account. Streaming, subtitles, and downloads for published content are available through the media API; unpublished content remains admin-only.
- **Admin dashboard (`/admin`):** manage movies, series, seasons, episodes, categories, subtitle-translator profiles, uploads, and publishing.
- **Comments:** watch pages include a comment section. Visitors can post with **name, email, and message**. Admin comments (posted while signed in as admin) use the admin account credentials, are marked with an admin badge/email, and appear at the top.
- **Admin account tools:** watchlist, ratings, watch history, profile, and download history are admin-account features.
- **Media:** uploads are stored privately. Original and 480p/720p/1080p variants can be provided when available. Direct HTTPS video URLs are proxied only for hostnames listed in `MEDIA_ALLOWED_HOSTS` (redirects rejected). Subtitles are uploaded as WebVTT and served via the media API.
- **Production:** use HTTPS, strong secrets, persistent private media storage, backups, and secure same-site frontend/API configuration. Do not upload or link media you are not licensed to distribute.

## API overview

- **Content:** `GET /api/content/featured`, `/catalog`, `/home`, `/movies`, `/movies/:slug`, `/movies/id/:id`, `/series`, `/series/:slug`, `/episodes/:id`, `/categories`
- **Comments (public):** `GET|POST /api/content/comments/:kind/:id` (`kind`: `movie` or `episode`)
- **Auth (admin):** `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (`POST /api/auth/register` is disabled)
- **Admin/user routes:** `/api/users/*` (admin-authenticated)
- **Admin:** `/api/admin/*`
- **Media:** `GET /api/media/images/:filename`, `/subtitles/:id`, `/:kind/:id/stream`, `/:kind/:id/download` (published content publicly accessible; admin access for unpublished content)
