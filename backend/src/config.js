import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jwtSecret = process.env.JWT_SECRET;
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 2048);

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}
if (!Number.isSafeInteger(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 10240) {
  throw new Error('MAX_UPLOAD_MB must be a whole number between 1 and 10240.');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mediaRoot: path.resolve(backendRoot, process.env.MEDIA_ROOT || './storage'),
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  allowedMediaHosts: (process.env.MEDIA_ALLOWED_HOSTS || '')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'noirplay'
  }
};
