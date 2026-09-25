import { env } from '../config/env.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie sessions.
 * Every state-changing request must
 *  1. carry the custom header `X-Requested-With: queless` (a plain HTML form
 *     on another site cannot add custom headers without a CORS preflight), and
 *  2. if the browser sends an Origin, it must be our frontend.
 */
export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.headers.origin;
  const originOk = !origin || env.frontendOrigins.includes(origin) || origin === `${req.protocol}://${req.headers.host}`;
  if (req.headers['x-requested-with'] !== 'queless' || !originOk) {
    return res.status(403).json({ code: 'CSRF', message: 'Request blocked (missing CSRF header or foreign origin)' });
  }
  next();
}
