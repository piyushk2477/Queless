// Reception tablet: set up with a key, list queues, hand out walk-in tokens.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { fn, many, one } from '../db/pool.js';
import { err } from '../lib/errors.js';
import { notesSchema, param, parse, prereqAckSchema } from '../lib/validate.js';
import { findKiosk, requireKiosk } from '../middleware/kiosk.js';
import { joinLimiter, kioskSetupLimiter } from '../middleware/rateLimit.js';

export const kioskRouter = Router();

kioskRouter.post('/kiosk/setup', kioskSetupLimiter, async (req, res) => {
  const { key } = parse(z.object({ key: z.string().trim().min(10).max(100) }), req.body);
  const kiosk = await findKiosk(key);
  if (!kiosk) throw err.unauthorized('Kiosk key is invalid or revoked');
  res.cookie('ql_kiosk', key, {
    httpOnly: true,
    maxAge: 365 * 24 * 3600 * 1000,
    sameSite: env.crossSiteCookies ? 'none' : 'lax',
    secure: env.isProd || env.crossSiteCookies,
  });
  const business = await one('select id, name, slug from businesses where id = $1', [kiosk.businessId]);
  res.json({ kiosk: { id: kiosk.id, name: kiosk.name }, business });
});

kioskRouter.get('/kiosk/queues', requireKiosk, async (req, res) => {
  const businessId = req.kiosk.businessId;
  const [business, queues] = await Promise.all([
    one('select id, name, slug, logo_file_id from businesses where id = $1', [businessId]),
    many('select id, name, token_prefix, status, is_express, prerequisites from queues where business_id = $1 order by name', [businessId]),
  ]);
  res.json({ business, queues });
});

kioskRouter.post('/kiosk/queues/:id/join', joinLimiter, requireKiosk, async (req, res) => {
  const queueId = param(req.params, 'id');
  const body = parse(z.object({ name: z.string().trim().max(40).optional(), prereqAck: prereqAckSchema, notes: notesSchema }), req.body);
  const queue = await one('select business_id from queues where id = $1', [queueId]);
  if (!queue || queue.business_id !== req.kiosk.businessId) throw err.forbidden('This queue is not served by this kiosk');

  const r = await fn('join_queue', {
    p_queue_id: queueId,
    p_guest_name: body.name || 'Walk-in',
    p_source: 'kiosk',
    p_prereq_ack: body.prereqAck,
    p_notes: body.notes,
  });
  const live = await one('select ewma_service_sec, active_counters from queue_live where queue_id = $1', [queueId]);
  const etaMin = Math.ceil(r.position / Math.max(live.active_counters, 1)) * Math.round(live.ewma_service_sec / 60);
  res.status(201).json({ entryId: r.id, tokenCode: r.token_code, claimCode: r.claim_code, position: r.position, etaMin });
});
