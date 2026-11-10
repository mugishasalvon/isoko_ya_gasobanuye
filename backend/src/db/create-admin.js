import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from './pool.js';

const emailResult = z.string().trim().email().max(254).safeParse(process.env.ADMIN_EMAIL || '');
const email = emailResult.success ? emailResult.data.toLowerCase() : '';
const password = process.env.ADMIN_PASSWORD || '';

if (!email) {
  throw new Error('Set a valid ADMIN_EMAIL in backend/.env before creating the admin account.');
}
if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters and no more than 72 bytes.');
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(`INSERT INTO users (name, email, password_hash, role)
    VALUES ('Administrator', ?, ?, 'admin')
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin'`,
  [email, passwordHash]);
  console.log(`Admin account is ready for ${email}. Sign in with ADMIN_PASSWORD from backend/.env.`);
} finally {
  await pool.end();
}
