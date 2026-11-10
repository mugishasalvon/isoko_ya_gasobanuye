import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const token = req.cookies.noirplay_token
    || req.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can sign in to this site.' });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }
  return next();
}

export function protectStateChanges(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.clientOrigin) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  return next();
}
