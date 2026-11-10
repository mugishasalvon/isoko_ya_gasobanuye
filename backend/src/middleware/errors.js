import multer from 'multer';
import { z } from 'zod';

export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) {
    console.error(error);
    if (!res.destroyed) res.end();
    return;
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Request validation failed.', details: error.issues });
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: error.message });
  }
  if (error.code === 'ER_DUP_ENTRY') {
    const key = error.message.match(/for key ['`](?:[^.'`]+\.)?([^'`.]+)['`]/i)?.[1];
    if (key === 'uq_season_episode') {
      return res.status(409).json({ error: 'That episode number already exists in this season. Choose a different number.' });
    }
    if (key === 'uq_series_season') {
      return res.status(409).json({ error: 'That season number already exists in this series. Choose a different number.' });
    }
    if (key === 'name') {
      return res.status(409).json({ error: 'A subtitle translator with that name already exists. Choose a different name or edit the existing profile.' });
    }
    if (key === 'slug') {
      return res.status(409).json({ error: 'That URL slug is already in use. Choose a different slug.' });
    }
    return res.status(409).json({ error: 'That slug, profile name, or catalogue entry already exists.' });
  }
  if (error.status && error.status < 500) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}
