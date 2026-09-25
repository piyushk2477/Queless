import { createHash, randomBytes } from 'node:crypto';
import { one } from '../db/pool.js';
import { err } from '../lib/errors.js';

export const hashKey = (key) => createHash('sha256').update(key).digest('hex');
export const newKioskKey = () => `qlk_${randomBytes(18).toString('base64url')}`;

export async function findKiosk(key) {
  const row = await one('select id, business_id, name, revoked_at from kiosk_devices where key_hash = $1', [hashKey(key)]);
  if (!row || row.revoked_at) return null;
  return { id: row.id, businessId: row.business_id, name: row.name };
}

/** Kiosk requests carry the key in the ql_kiosk cookie or the X-Kiosk-Key header. */
export async function requireKiosk(req, _res, next) {
  const key = req.headers['x-kiosk-key'] ?? req.cookies?.ql_kiosk;
  if (!key) throw err.unauthorized('This device is not set up as a kiosk');
  const kiosk = await findKiosk(String(key));
  if (!kiosk) throw err.unauthorized('Kiosk key is invalid or revoked');
  req.kiosk = kiosk;
  next();
}
