// Public reads: categories, search, business pages, live queue state, stats.
import { Router } from 'express';
import { z } from 'zod';
import { fn, fnRows, many, one } from '../db/pool.js';
import { err } from '../lib/errors.js';
import { param, parse, todayIST } from '../lib/validate.js';
import { memberRole, optionalAuth } from '../middleware/auth.js';

export const publicRouter = Router();

const BUSINESS_COLS = `b.id, b.slug, b.name, b.category_id, b.description, b.address, b.city, b.pincode, b.phone,
  b.lat, b.lng, b.amenities, b.opening_hours, b.logo_file_id, b.status, b.owner_id, b.created_at,
  json_build_object('name', c.name, 'icon', c.icon, 'slug', c.slug) as category`;

/** Approved businesses are public; pending ones only for members/admin. */
async function assertVisible(user, business) {
  if (business.status === 'approved') return;
  if (!(await memberRole(user, business.id))) throw err.notFound('Business');
}

publicRouter.get('/categories', async (_req, res) => {
  res.json({ categories: await many('select * from categories order by sort_order, name') });
});

publicRouter.get('/pincodes/:pin', async (req, res) => {
  const pin = parse(z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'), req.params.pin);
  const row = await one('select * from pincodes where pincode = $1', [pin]);
  if (!row) throw err.notFound(`Pincode ${pin}`);
  res.json({ pincode: row });
});

const flag = z.enum(['1', 'true', '0', 'false']).optional().transform((v) => v === '1' || v === 'true');

publicRouter.get('/search', async (req, res) => {
  const q = parse(
    z.object({
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radius: z.coerce.number().int().min(500).max(50000).default(5000),
      category: z.string().max(40).optional(),
      q: z.string().trim().max(80).optional(),
      wheelchair: flag,
      parking: flag,
      express: flag,
      open: flag,
    }),
    req.query,
  );
  const results = await fnRows('search_businesses', {
    p_lat: q.lat ?? null,
    p_lng: q.lng ?? null,
    p_radius_m: q.radius,
    p_category: q.category || null,
    p_q: q.q || null,
    p_wheelchair: q.wheelchair,
    p_parking: q.parking,
    p_express: q.express,
    p_open_now: q.open,
  });
  res.json({ results });
});

publicRouter.get('/businesses/:slug', optionalAuth, async (req, res) => {
  const b = await one(`select ${BUSINESS_COLS} from businesses b join categories c on c.id = b.category_id where b.slug = $1`, [req.params.slug]);
  if (!b) throw err.notFound('Business');
  await assertVisible(req.user, b);
  const [services, queues] = await Promise.all([
    many('select * from services where business_id = $1 order by name', [b.id]),
    many('select * from queues where business_id = $1 order by name', [b.id]),
  ]);
  delete b.owner_id;
  res.json({ business: b, services, queues });
});

/** Queue detail for the join page. */
publicRouter.get('/queues/:id', optionalAuth, async (req, res) => {
  const q = await one(
    `select q.*, json_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'address', b.address,
            'logo_file_id', b.logo_file_id, 'status', b.status) as business
       from queues q join businesses b on b.id = q.business_id where q.id = $1`,
    [param(req.params, 'id')],
  );
  if (!q) throw err.notFound('Queue');
  await assertVisible(req.user, { id: q.business_id, status: q.business.status });
  res.json({ queue: q });
});

publicRouter.get('/queues/:id/alternatives', async (req, res) => {
  const radius = parse(z.coerce.number().int().min(500).max(20000).default(5000), req.query.radius);
  res.json({ alternatives: await fn('queue_alternatives', { p_queue_id: param(req.params, 'id'), p_radius_m: radius }) });
});

/** Current live rows (token codes only). The browser then listens on Socket.IO. */
publicRouter.get('/live', async (req, res) => {
  const ids = parse(z.array(z.guid()).max(100), String(req.query.ids ?? '').split(',').filter(Boolean));
  res.json({ live: ids.length ? await many('select * from queue_live where queue_id = any($1::uuid[])', [ids]) : [] });
});

publicRouter.get('/broadcasts', async (req, res) => {
  const ids = parse(z.array(z.guid()).max(100), String(req.query.queues ?? '').split(',').filter(Boolean));
  const rows = ids.length
    ? await many(
        `select id, queue_id, message, from_seq, to_seq, created_at from broadcasts
          where queue_id = any($1::uuid[]) and (created_at at time zone 'Asia/Kolkata')::date = $2::date
          order by created_at desc limit 20`,
        [ids, todayIST()],
      )
    : [];
  res.json({ broadcasts: rows });
});

/** Numbers for the landing-page "live desk". */
publicRouter.get('/stats/public', async (_req, res) => {
  const row = await one(
    `select
       (select coalesce(sum(waiting_count), 0) from queue_live ql join businesses b on b.id = ql.business_id where b.status = 'approved') as waiting_now,
       (select count(*) from queue_entries where service_date = app_today() and status = 'COMPLETED') as served_today,
       (select count(*) from queue_entries where service_date = app_today()) as tokens_today,
       (select count(*) from businesses where status = 'approved') as businesses_live,
       (select count(*) from queues q join businesses b on b.id = q.business_id where q.status = 'open' and b.status = 'approved') as queues_open,
       (select round(avg(extract(epoch from called_at - joined_at))) from queue_entries
         where service_date = app_today() and called_at is not null) as avg_wait_sec`,
  );
  res.json(row);
});

/** TV display: business + queues (public, approved only). */
publicRouter.get('/display/:slug', async (req, res) => {
  const b = await one(`select id, name, slug from businesses where slug = $1 and status = 'approved'`, [req.params.slug]);
  if (!b) throw err.notFound('Display');
  res.json({ business: b, queues: await many('select id, name, token_prefix, status from queues where business_id = $1 order by name', [b.id]) });
});
