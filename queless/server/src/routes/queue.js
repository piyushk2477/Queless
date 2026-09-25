// Customer + guest (QR) joining, the token tracker, leaving, and "my" data.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { fn, many, one, query } from '../db/pool.js';
import { err } from '../lib/errors.js';
import { notesSchema, param, parse, prereqAckSchema } from '../lib/validate.js';
import { memberRole, optionalAuth, requireAuth } from '../middleware/auth.js';
import { joinLimiter } from '../middleware/rateLimit.js';

export const queueRouter = Router();

const joinBody = z.object({ prereqAck: prereqAckSchema, notes: notesSchema });

// ---------------------------------------------------------------- customer join
queueRouter.post('/queues/:id/join', joinLimiter, requireAuth, async (req, res) => {
  const queueId = param(req.params, 'id');
  const body = parse(joinBody, req.body);
  const r = await fn('join_queue', {
    p_queue_id: queueId,
    p_user_id: req.user.id,
    p_source: 'app',
    p_prereq_ack: body.prereqAck,
    p_notes: body.notes,
  });
  res.status(201).json({ entryId: r.id, tokenCode: r.token_code, position: r.position });
});

// ---------------------------------------------------------------- guest QR join
const DEVICE_COOKIE = 'ql_device';

/** Guests are identified by a random device id (cookie, or header from the web app). */
function deviceId(req, res) {
  const existing = req.headers['x-device-id'] || req.cookies?.[DEVICE_COOKIE];
  if (typeof existing === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(existing)) return existing;
  const fresh = randomUUID();
  res.cookie(DEVICE_COOKIE, fresh, {
    httpOnly: true,
    maxAge: 365 * 24 * 3600 * 1000,
    sameSite: env.crossSiteCookies ? 'none' : 'lax',
    secure: env.isProd || env.crossSiteCookies,
  });
  return fresh;
}

queueRouter.post('/qr/queues/:id/join', joinLimiter, async (req, res) => {
  const queueId = param(req.params, 'id');
  const body = parse(joinBody.extend({ name: z.string().trim().min(2, 'Your name please').max(40) }), req.body);
  const device = deviceId(req, res);
  const r = await fn('join_queue', {
    p_queue_id: queueId,
    p_guest_name: body.name,
    p_device_id: device,
    p_source: 'qr',
    p_prereq_ack: body.prereqAck,
    p_notes: body.notes,
  });
  res.status(201).json({ entryId: r.id, claimCode: r.claim_code, tokenCode: r.token_code, position: r.position });
});

// ---------------------------------------------------------------- tracker
/** Owner (session), staff of the business, or anyone holding the claim code. */
async function loadEntryForViewer(req, entryId) {
  const e = await one(
    `select e.id, e.queue_id, e.business_id, e.user_id, e.guest_name, e.source, e.service_date, e.seq, e.token_code,
            e.status, e.counter_id, e.notes, e.claim_code, e.joined_at, e.called_at, e.serving_at, e.finished_at,
            c.name as counter_name
       from queue_entries e left join counters c on c.id = e.counter_id where e.id = $1`,
    [entryId],
  );
  if (!e) throw err.notFound('Token');
  const claim = typeof req.query.claim === 'string' ? req.query.claim.toUpperCase() : null;
  const allowed =
    (req.user && e.user_id === req.user.id) || (claim && claim === e.claim_code) || (await memberRole(req.user, e.business_id));
  if (!allowed) throw err.forbidden('Invalid tracking link');
  return e;
}

queueRouter.get('/entries/:id', optionalAuth, async (req, res) => {
  const e = await loadEntryForViewer(req, param(req.params, 'id'));
  const [queue, business] = await Promise.all([
    one('select id, name, token_prefix, grace_sec, prerequisites from queues where id = $1', [e.queue_id]),
    one('select id, name, slug, address from businesses where id = $1', [e.business_id]),
  ]);
  delete e.user_id;
  res.json({ entry: e, queue, business });
});

queueRouter.delete('/entries/:id', optionalAuth, async (req, res) => {
  const e = await loadEntryForViewer(req, param(req.params, 'id'));
  const updated = await fn('transition_entry', { p_entry_id: e.id, p_to: 'CANCELLED', p_actor: req.user?.id ?? null });
  res.json({ status: updated.status });
});

// ---------------------------------------------------------------- my tokens & inbox
queueRouter.get('/me/entries', requireAuth, async (req, res) => {
  const rows = await many(
    `select e.id, e.queue_id, e.token_code, e.status, e.seq, e.joined_at, e.service_date,
            q.name as queue_name, b.name as business_name, b.slug as business_slug
       from queue_entries e join queues q on q.id = e.queue_id join businesses b on b.id = e.business_id
      where e.user_id = $1 order by e.joined_at desc limit 50`,
    [req.user.id],
  );
  res.json({ entries: rows });
});

queueRouter.get('/me/notifications', requireAuth, async (req, res) => {
  res.json({
    notifications: await many(
      'select id, title, body, entry_id, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 50',
      [req.user.id],
    ),
  });
});

queueRouter.post('/me/notifications/read-all', requireAuth, async (req, res) => {
  await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
  res.json({ ok: true });
});
