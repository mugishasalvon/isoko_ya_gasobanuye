import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';

const imageTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif']
]);
const subtitleTypes = new Map([['text/vtt', '.vtt']]);
const videoTypes = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov']
]);

fs.mkdirSync(config.mediaRoot, { recursive: true });

export const uploadContent = multer({
  storage: multer.diskStorage({
    destination(_req, file, callback) {
      const directoryName = file.fieldname === 'subtitle' ? 'subtitles'
        : file.fieldname === 'video' || file.fieldname.startsWith('video_') ? 'video' : 'images';
      const directory = path.join(config.mediaRoot, directoryName);
      fs.mkdir(directory, { recursive: true }, (error) => callback(error, directory));
    },
    filename(_req, file, callback) {
      const extension = imageTypes.get(file.mimetype) || videoTypes.get(file.mimetype)
        || subtitleTypes.get(file.mimetype);
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: config.maxUploadBytes, files: 9, fields: 40 },
  fileFilter(_req, file, callback) {
    const isVideo = file.fieldname === 'video' || file.fieldname.startsWith('video_');
    const valid = file.fieldname === 'subtitle' ? subtitleTypes.has(file.mimetype)
      : isVideo ? videoTypes.has(file.mimetype)
        : ['poster', 'banner', 'thumbnail', 'translator_image', 'translator_avatar'].includes(file.fieldname) && imageTypes.has(file.mimetype);
    if (!valid) {
      const error = new Error('Unsupported file type. Use MP4/WebM/MOV video, JPG/PNG/WebP/AVIF images, and WebVTT subtitles.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'video_480p', maxCount: 1 },
  { name: 'video_720p', maxCount: 1 },
  { name: 'video_1080p', maxCount: 1 },
  { name: 'poster', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
  { name: 'translator_image', maxCount: 1 },
  { name: 'translator_avatar', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'subtitle', maxCount: 1 }
]);
