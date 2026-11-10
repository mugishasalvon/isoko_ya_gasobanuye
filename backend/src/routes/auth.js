import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const credentials = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(72)
});
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function issueSession(res, user) {
  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  res.cookie('noirplay_token', token, cookieOptions);
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
    created_at: user.created_at
  };
}

router.post('/register', (_req, res) => res.status(410).json({
  error: 'Account registration is disabled. Sign in with an administrator account.'
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role, avatar_url FROM users WHERE email = ? LIMIT 1',
    [input.email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash)) || user.role !== 'admin') {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  issueSession(res, user);
  res.json({ user: safeUser(user) });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie('noirplay_token', { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json({ user: safeUser(rows[0]) });
}));

export default router;
