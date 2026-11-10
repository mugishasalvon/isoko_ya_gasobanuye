# Noirplay

Noirplay is a full-stack streaming catalogue starter built with React, Vite, Express, and MySQL or MariaDB. The frontend reads the REST API; content and user data are stored in the database, and uploaded media stays in private backend storage and is served only by authorized API routes.

## Requirements

- Node.js 20.19+ and npm
- MySQL 8+ or MariaDB 10.4+

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set your MySQL credentials and a long random `JWT_SECRET`.
2. From this folder, run `npm install`.
3. Create or update the database tables with `npm run db:setup`. You can rerun this after app updates to apply compatible schema additions.
4. To create or update your administrator account, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`, then run `npm run admin:create -w backend`. Use a unique password with at least 12 characters. If that email already exists, the command promotes the account and sets its password to `ADMIN_PASSWORD`.
5. Optionally add fictional local-development catalogue entries with `npm run seed`.
6. Start both applications with `npm run dev`.

The Vite app is served at `http://localhost:5173` and the API at `http://localhost:4000`. Set `CLIENT_ORIGIN` and `VITE_API_URL` if you use different addresses. API documentation and health checks are exposed at `/api/health`.

## Development notes

- The optional seed command contains fictional sample titles for local development; it is not run automatically in production.
- Public registration is disabled, and only administrator accounts can sign in. Existing member records are retained but cannot authenticate. Create or update admin access with the explicit `admin:create` command; the app does not ship with default credentials.
- Admins can create and edit movies, series, seasons, episodes, and categories through the `/admin` page.
- Admins can create reusable subtitle-translator profiles in the dashboard and assign them to movies. Rerunning `npm run db:setup` migrates existing movie translator credits into profiles.
- Search covers movie and series details, cast, categories, episode titles, and subtitle-translator credits, with live suggestions as you type.
- Movie and episode video uploads are private. The API checks publication/access rights and supports HTTP byte-range streaming. Downloads require an administrator sign-in and an enabled download permission.
- Upload original videos or separate 480p/720p/1080p renditions; only uploaded versions are offered as download choices. Direct HTTPS video URLs are proxied only when their exact hostname is listed in `MEDIA_ALLOWED_HOSTS`, and redirects are rejected.
- Subtitle tracks are uploaded as WebVTT and served through the authenticated media API.
- Production deployment must use HTTPS, a strong secret, persistent private media storage, backups, and a secure same-site frontend/API deployment configuration.
- Posters and backdrops can be absolute image URLs; do not upload media you are not licensed to distribute.

## API overview

- `GET /api/content/featured`, `/movies`, `/movies/:slug`, `/series`, `/series/:slug`, `/categories`
- `POST /api/auth/register`, `/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Authenticated watchlist and watch-history routes under `/api/users`
- Admin publishing, upload, and analytics routes under `/api/admin`
- Authorized video streaming and downloading under `/api/media/:kind/:id`
