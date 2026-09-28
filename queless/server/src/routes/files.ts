// Uploads (logo = public, KYC = private). Stored in Postgres (table files), max 2 MB.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { one } from '../db/pool.js';
import { AppError, err } from '../lib/errors.js';
import { param, parse } from '../lib/validate.js';
import { memberRole, optionalAuth, requireAuth } from '../middleware/auth.js';

export const filesRouter = Router();

const TYPES = { logo: ['image/png', 'image/jpeg', 'image/webp'], kyc: ['image/png', 'image/jpeg', 'application/pdf'] };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

filesRouter.post('/files', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (e) => {
    if (e) return next(new AppError(400, 'VALIDATION', e.code === 'LIMIT_FILE_SIZE' ? 'File must be under 2 MB' : e.message));
    next();
  });
}, async (req, res) => {
  const kind = parse(z.enum(['logo', 'kyc']), req.body?.kind);
  if (!req.file) throw err.validation('Choose a file');
  if (!TYPES[kind].includes(req.file.mimetype)) throw err.validation(kind === 'logo' ? 'Logo must be PNG, JPG or WEBP' : 'KYC must be PDF, PNG or JPG');
  const row = await one('insert into files (owner_id, kind, mime, size_bytes, data) values ($1,$2,$3,$4,$5) returning id, kind', [
    req.user.id, kind, req.file.mimetype, req.file.size, req.file.buffer,
  ]);
  res.status(201).json({ file: row });
});

/** Logos are public. KYC files: the uploader, managers of the business, or an admin. */
filesRouter.get('/files/:id', optionalAuth, async (req, res) => {
  const id = param(req.params, 'id');
  const f = await one('select id, owner_id, kind, mime, data from files where id = $1', [id]);
  if (!f) throw err.notFound('File');
  if (f.kind === 'kyc') {
    const biz = await one('select id from businesses where kyc_file_id = $1', [id]);
    const allowed =
      req.user && (req.user.role === 'admin' || f.owner_id === req.user.id || (biz && (await memberRole(req.user, biz.id)) === 'manager'));
    if (!allowed) throw err.forbidden();
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  }
  res.setHeader('Content-Type', f.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // lets the web app show logos
  res.send(f.data);
});
