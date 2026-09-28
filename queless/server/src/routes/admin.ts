// Platform admin: approvals, categories & keywords, users, stats.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { fn, many, one, query } from '../db/pool.js';
import { emailTemplate, esc, sendEmail } from '../lib/email.js';
import { err } from '../lib/errors.js';
import { param, parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole('admin'));

// ------------------------------------------------------------------ businesses
adminRouter.get('/admin/businesses', async (req, res) => {
  const status = parse(z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(), req.query.status);
  const rows = await many(
    `select b.id, b.slug, b.name, b.address, b.pincode, b.phone, b.status, b.reject_reason, b.created_at,
            b.logo_file_id, b.kyc_file_id, c.name as category_name, c.icon as category_icon,
            u.full_name as owner_name, u.email as owner_email
       from businesses b join categories c on c.id = b.category_id left join users u on u.id = b.owner_id
      where ($1::text is null or b.status = $1) order by b.created_at desc`,
    [status ?? null],
  );
  res.json({ businesses: rows });
});

async function notifyOwner(businessId, title, body) {
  const b = await one('select b.name, u.email from businesses b left join users u on u.id = b.owner_id where b.id = $1', [businessId]);
  if (b?.email) {
    await sendEmail({
      to: b.email,
      subject: `${title}: ${b.name}`,
      html: emailTemplate(title, body.replace('{name}', esc(b.name)), { label: 'Open dashboard', url: `${env.frontendOrigins[0]}/biz` }),
    });
  }
}

adminRouter.post('/admin/businesses/:id/:action', async (req, res, next) => {
  const id = param(req.params, 'id');
  const action = req.params.action;
  if (!['approve', 'reject', 'suspend'].includes(action)) return next();
  if (action === 'approve') {
    await query(`update businesses set status = 'approved', reject_reason = null where id = $1`, [id]);
    await notifyOwner(id, 'Approved 🎉', '<b>{name}</b> is now live on QueLess. Open your queues and start serving!');
  } else if (action === 'reject') {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(300) }), req.body);
    await query(`update businesses set status = 'rejected', reject_reason = $2 where id = $1`, [id, reason]);
    await notifyOwner(id, 'Changes needed', `We could not approve <b>{name}</b> yet. Reason: ${esc(reason)}`);
  } else {
    await query(`update businesses set status = 'suspended' where id = $1`, [id]);
    await query(`update queues set status = 'closed' where business_id = $1`, [id]);
    await notifyOwner(id, 'Suspended', '<b>{name}</b> has been suspended. Contact support for details.');
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------ categories & keywords
const categoryBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().min(1).max(8).default('📍'),
  sortOrder: z.number().int().default(0),
});

adminRouter.post('/admin/categories', async (req, res) => {
  const c = parse(categoryBody, req.body);
  res.status(201).json({
    category: await one('insert into categories (slug, name, icon, sort_order) values ($1,$2,$3,$4) returning *', [c.slug, c.name, c.icon, c.sortOrder]),
  });
});

adminRouter.delete('/admin/categories/:id', async (req, res) => {
  await query('delete from categories where id = $1', [parse(z.coerce.number().int(), req.params.id)]);
  res.status(204).end();
});

adminRouter.get('/admin/keywords', async (_req, res) => {
  res.json({ keywords: await many('select * from need_keywords order by keyword') });
});

adminRouter.post('/admin/keywords', async (req, res) => {
  const k = parse(
    z.object({ keyword: z.string().trim().toLowerCase().min(2).max(60), categoryId: z.number().int(), serviceTag: z.string().trim().min(1).max(40) }),
    req.body,
  );
  res.status(201).json({
    keyword: await one('insert into need_keywords (keyword, category_id, service_tag) values ($1,$2,$3) returning *', [k.keyword, k.categoryId, k.serviceTag]),
  });
});

adminRouter.delete('/admin/keywords/:id', async (req, res) => {
  await query('delete from need_keywords where id = $1', [parse(z.coerce.number().int(), req.params.id)]);
  res.status(204).end();
});

// ------------------------------------------------------------------ users
adminRouter.get('/admin/users', async (req, res) => {
  const q = parse(z.string().trim().max(80).optional(), req.query.q);
  const like = q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null;
  res.json({
    users: await many(
      `select id, full_name, email, role, is_blocked, created_at, last_login_at from users
        where $1::text is null or email ilike $1 or full_name ilike $1
        order by created_at desc limit 100`,
      [like],
    ),
  });
});

adminRouter.post('/admin/users/:id/:action', async (req, res, next) => {
  const id = param(req.params, 'id');
  const action = req.params.action;
  if (action !== 'block' && action !== 'unblock') return next();
  if (id === req.user.id) throw err.validation('You cannot block yourself');
  await query('update users set is_blocked = $2 where id = $1', [id, action === 'block']);
  if (action === 'block') await query(`delete from user_sessions where sess->>'userId' = $1`, [id]); // log them out everywhere
  res.json({ ok: true });
});

// ------------------------------------------------------------------ stats
adminRouter.get('/admin/stats', async (req, res) => {
  const days = parse(z.coerce.number().int().min(1).max(90).default(14), req.query.days);
  res.json(await fn('admin_stats', { p_days: days }));
});

adminRouter.get('/admin/stats.csv', async (req, res) => {
  const days = parse(z.coerce.number().int().min(1).max(90).default(30), req.query.days);
  const stats = await fn('admin_stats', { p_days: days });
  const csv = ['date,tokens', ...stats.per_day.map((r) => `${r.date},${r.tokens}`)].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="queless-tokens-${days}d.csv"`);
  res.send(csv);
});
