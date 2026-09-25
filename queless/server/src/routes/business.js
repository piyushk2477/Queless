// Business setup: onboarding, services, queues, counters, staff, kiosks, analytics.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { fn, many, one, query, tx } from '../db/pool.js';
import { err } from '../lib/errors.js';
import { param, parse, todayIST } from '../lib/validate.js';
import { assertMember, businessOf, requireAuth } from '../middleware/auth.js';
import { hashKey, newKioskKey } from '../middleware/kiosk.js';

export const businessRouter = Router();

// ------------------------------------------------------------------ schemas
const time = z.string().regex(/^\d{2}:\d{2}$/);
const hoursSchema = z.partialRecord(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.tuple([time, time]).nullable());

const businessBody = z.object({
  name: z.string().trim().min(3).max(80),
  categoryId: z.number().int().positive(),
  description: z.string().trim().max(500).default(''),
  address: z.string().trim().min(5).max(200),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  phone: z.string().trim().max(20).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  amenities: z.object({ wheelchair: z.boolean().default(false), parking: z.boolean().default(false) }).default({ wheelchair: false, parking: false }),
  openingHours: hoursSchema.default({}),
  logoFileId: z.guid().nullable().optional(),
  kycFileId: z.guid().nullable().optional(),
});

const prerequisite = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, 'ids use a-z, 0-9 and _'),
  label: z.string().trim().min(2).max(120),
  required: z.boolean(),
});

const queueBody = z.object({
  name: z.string().trim().min(2).max(60),
  serviceId: z.guid().nullable().optional(),
  tokenPrefix: z.string().regex(/^[A-Z]$/, 'Prefix is one capital letter A–Z'),
  dailyCapacity: z.number().int().min(1).max(5000).default(200),
  graceSec: z.number().int().min(30).max(3600).default(300),
  isExpress: z.boolean().default(false),
  prerequisites: z.array(prerequisite).max(15).default([]),
});

const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  defaultServiceSec: z.number().int().min(30).max(7200).default(300),
});

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'business';

/** Build "col = $n" pairs for a partial update, skipping undefined values. */
function setClause(map, startAt = 2) {
  const cols = Object.entries(map).filter(([, v]) => v !== undefined);
  return {
    sql: cols.map(([c], i) => `${c} = $${i + startAt}`).join(', '),
    values: cols.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v)),
  };
}

// ------------------------------------------------------------------ businesses
businessRouter.post('/businesses', requireAuth, async (req, res) => {
  const b = parse(businessBody, req.body);
  let slug = slugify(b.name);
  if (await one('select 1 from businesses where slug = $1', [slug])) slug = `${slug}-${randomUUID().slice(0, 4)}`;

  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `insert into businesses (owner_id, slug, name, category_id, description, address, pincode, phone, location,
                               amenities, opening_hours, logo_file_id, kyc_file_id, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8, make_point($9, $10), $11,$12,$13,$14,'pending')
       returning id, slug, status`,
      [req.user.id, slug, b.name, b.categoryId, b.description, b.address, b.pincode, b.phone ?? null, b.lat, b.lng,
        JSON.stringify(b.amenities), JSON.stringify(b.openingHours), b.logoFileId ?? null, b.kycFileId ?? null],
    );
    await c.query(`insert into business_members (business_id, user_id, role) values ($1, $2, 'manager')`, [rows[0].id, req.user.id]);
    await c.query(`update users set role = 'business' where id = $1 and role = 'customer'`, [req.user.id]);
    return rows[0];
  });
  res.status(201).json({ business: row });
});

/** Full business record for members (any status). */
businessRouter.get('/businesses/:id/manage', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  const role = await assertMember(req.user, id, 'staff');
  const business = await one(
    `select b.id, b.slug, b.name, b.category_id, b.description, b.address, b.city, b.pincode, b.phone, b.lat, b.lng,
            b.amenities, b.opening_hours, b.logo_file_id, b.kyc_file_id, b.status, b.reject_reason, b.owner_id, b.created_at,
            json_build_object('name', c.name, 'icon', c.icon, 'slug', c.slug) as category
       from businesses b join categories c on c.id = b.category_id where b.id = $1`,
    [id],
  );
  res.json({ business, role });
});

businessRouter.patch('/businesses/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'manager');
  const b = parse(businessBody.partial(), req.body);
  const current = await one('select status from businesses where id = $1', [id]);
  const { sql, values } = setClause({
    name: b.name,
    category_id: b.categoryId,
    description: b.description,
    address: b.address,
    pincode: b.pincode,
    phone: b.phone,
    amenities: b.amenities,
    opening_hours: b.openingHours,
    logo_file_id: b.logoFileId,
    kyc_file_id: b.kycFileId,
    status: current.status === 'rejected' ? 'pending' : undefined, // re-submit after fixing
  });
  const parts = [sql];
  if (b.lat !== undefined && b.lng !== undefined) {
    values.push(b.lng, b.lat);
    parts.push(`location = make_point($${values.length + 1}, $${values.length + 0})`);
  }
  const clause = parts.filter(Boolean).join(', ');
  const row = clause
    ? await one(`update businesses set ${clause} where id = $1 returning id, slug, status`, [id, ...values])
    : await one('select id, slug, status from businesses where id = $1', [id]);
  res.json({ business: row });
});

// ------------------------------------------------------------------ services
businessRouter.get('/businesses/:id/services', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'staff');
  res.json({ services: await many('select * from services where business_id = $1 order by name', [id]) });
});

businessRouter.post('/businesses/:id/services', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'manager');
  const s = parse(serviceBody, req.body);
  const row = await one('insert into services (business_id, name, tags, default_service_sec) values ($1,$2,$3,$4) returning *', [
    businessId, s.name, s.tags, s.defaultServiceSec,
  ]);
  res.status(201).json({ service: row });
});

businessRouter.patch('/services/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('services', id), 'manager');
  const s = parse(serviceBody.partial(), req.body);
  const row = await one(
    `update services set name = coalesce($2, name), tags = coalesce($3, tags), default_service_sec = coalesce($4, default_service_sec)
     where id = $1 returning *`,
    [id, s.name ?? null, s.tags ?? null, s.defaultServiceSec ?? null],
  );
  res.json({ service: row });
});

businessRouter.delete('/services/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('services', id), 'manager');
  await query('delete from services where id = $1', [id]);
  res.status(204).end();
});

// ------------------------------------------------------------------ queues
businessRouter.get('/businesses/:id/queues', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'staff');
  res.json({ queues: await many('select * from queues where business_id = $1 order by name', [id]) });
});

businessRouter.post('/businesses/:id/queues', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'manager');
  const q = parse(queueBody, req.body);
  const row = await one(
    `insert into queues (business_id, service_id, name, token_prefix, daily_capacity, grace_sec, is_express, prerequisites, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'closed') returning *`,
    [businessId, q.serviceId ?? null, q.name, q.tokenPrefix, q.dailyCapacity, q.graceSec, q.isExpress, JSON.stringify(q.prerequisites)],
  );
  res.status(201).json({ queue: row });
});

businessRouter.patch('/queues/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('queues', id), 'manager');
  const q = parse(queueBody.partial(), req.body);
  const { sql, values } = setClause({
    name: q.name,
    service_id: q.serviceId,
    token_prefix: q.tokenPrefix,
    daily_capacity: q.dailyCapacity,
    grace_sec: q.graceSec,
    is_express: q.isExpress,
    prerequisites: q.prerequisites,
  });
  const row = sql ? await one(`update queues set ${sql} where id = $1 returning *`, [id, ...values]) : await one('select * from queues where id = $1', [id]);
  res.json({ queue: row });
});

businessRouter.delete('/queues/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('queues', id), 'manager');
  const active = await one(`select count(*) as n from queue_entries where queue_id = $1 and status in ('WAITING','CALLED','SERVING')`, [id]);
  if (active.n > 0) throw err.validation('Close the queue and finish active tokens before deleting it');
  await query('delete from queues where id = $1', [id]);
  res.status(204).end();
});

// ------------------------------------------------------------------ counters
const counterBody = z.object({ name: z.string().trim().min(1).max(40), isActive: z.boolean().default(true) });

businessRouter.get('/businesses/:id/counters', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'staff');
  res.json({
    counters: await many(
      `select c.*, coalesce(array_agg(cq.queue_id) filter (where cq.queue_id is not null), '{}') as queue_ids
         from counters c left join counter_queues cq on cq.counter_id = c.id
        where c.business_id = $1 group by c.id order by c.name`,
      [id],
    ),
  });
});

businessRouter.post('/businesses/:id/counters', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'manager');
  const c = parse(counterBody, req.body);
  res.status(201).json({ counter: await one('insert into counters (business_id, name, is_active) values ($1,$2,$3) returning *', [businessId, c.name, c.isActive]) });
});

businessRouter.patch('/counters/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('counters', id), 'manager');
  const c = parse(counterBody.partial(), req.body);
  res.json({
    counter: await one('update counters set name = coalesce($2, name), is_active = coalesce($3, is_active) where id = $1 returning *', [id, c.name ?? null, c.isActive ?? null]),
  });
});

businessRouter.delete('/counters/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('counters', id), 'manager');
  await query('delete from counters where id = $1', [id]);
  res.status(204).end();
});

businessRouter.put('/counters/:id/queues', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  const businessId = await businessOf('counters', id);
  await assertMember(req.user, businessId, 'manager');
  const { queueIds } = parse(z.object({ queueIds: z.array(z.guid()).max(50) }), req.body);
  if (queueIds.length) {
    const own = await one('select count(*) as n from queues where business_id = $1 and id = any($2::uuid[])', [businessId, queueIds]);
    if (own.n !== queueIds.length) throw err.validation('Some queues do not belong to this business');
  }
  await tx(async (c) => {
    await c.query('delete from counter_queues where counter_id = $1', [id]);
    for (const q of queueIds) await c.query('insert into counter_queues (counter_id, queue_id) values ($1, $2)', [id, q]);
  });
  res.json({ queueIds });
});

// ------------------------------------------------------------------ staff
businessRouter.get('/businesses/:id/members', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'staff');
  res.json({
    members: await many(
      `select m.user_id, m.role, m.created_at, u.full_name, u.email
         from business_members m join users u on u.id = m.user_id where m.business_id = $1 order by m.created_at`,
      [id],
    ),
  });
});

businessRouter.post('/businesses/:id/members', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'manager');
  const { email, role } = parse(z.object({ email: z.email().transform((e) => e.toLowerCase()), role: z.enum(['manager', 'staff']) }), req.body);
  const user = await one('select id from users where lower(email) = $1', [email]);
  if (!user) throw err.notFound('No QueLess account with that email. Ask them to sign up first — the account');
  await query(
    `insert into business_members (business_id, user_id, role) values ($1,$2,$3)
     on conflict (business_id, user_id) do update set role = excluded.role`,
    [businessId, user.id, role],
  );
  await query(`update users set role = 'business' where id = $1 and role = 'customer'`, [user.id]);
  res.status(201).json({ userId: user.id, role });
});

businessRouter.delete('/businesses/:id/members/:userId', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  const userId = param(req.params, 'userId');
  await assertMember(req.user, businessId, 'manager');
  if (userId === req.user.id) throw err.validation('You cannot remove yourself');
  await query('delete from business_members where business_id = $1 and user_id = $2', [businessId, userId]);
  res.status(204).end();
});

// ------------------------------------------------------------------ kiosks
businessRouter.get('/businesses/:id/kiosks', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, id, 'manager');
  res.json({ kiosks: await many('select id, name, created_at, revoked_at from kiosk_devices where business_id = $1 order by created_at', [id]) });
});

businessRouter.post('/businesses/:id/kiosks', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'manager');
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(40) }), req.body);
  const key = newKioskKey();
  const kiosk = await one('insert into kiosk_devices (business_id, name, key_hash) values ($1,$2,$3) returning id, name, created_at', [businessId, name, hashKey(key)]);
  res.status(201).json({ kiosk, key }); // the plain key is shown ONCE; only its hash is stored
});

businessRouter.delete('/kiosks/:id', requireAuth, async (req, res) => {
  const id = param(req.params, 'id');
  await assertMember(req.user, await businessOf('kiosk_devices', id), 'manager');
  await query('update kiosk_devices set revoked_at = now() where id = $1', [id]);
  res.status(204).end();
});

// ------------------------------------------------------------------ analytics
businessRouter.get('/businesses/:id/analytics', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'staff');
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const from = parse(date.default(todayIST()), req.query.from);
  const to = parse(date.default(todayIST()), req.query.to);
  if (from > to) throw err.validation('"from" must be before "to"');
  const data = await fn('business_analytics', { p_business_id: businessId, p_from: from, p_to: to });
  res.json({ from, to, ...data });
});
