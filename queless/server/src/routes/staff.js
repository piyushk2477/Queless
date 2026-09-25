// Counter console: live data, call next, start/complete/skip/no-show/recall, queue status, broadcasts.
import { Router } from 'express';
import { z } from 'zod';
import { fn, many, one, query } from '../db/pool.js';
import { param, parse, todayIST } from '../lib/validate.js';
import { assertMember, businessOf, requireAuth } from '../middleware/auth.js';

export const staffRouter = Router();

/** Everything the console screen needs in one request. */
staffRouter.get('/businesses/:id/console', requireAuth, async (req, res) => {
  const businessId = param(req.params, 'id');
  await assertMember(req.user, businessId, 'staff');
  const [counters, queues, entries] = await Promise.all([
    many(
      `select c.*, coalesce(array_agg(cq.queue_id) filter (where cq.queue_id is not null), '{}') as queue_ids
         from counters c left join counter_queues cq on cq.counter_id = c.id
        where c.business_id = $1 group by c.id order by c.name`,
      [businessId],
    ),
    many('select * from queues where business_id = $1 order by name', [businessId]),
    many(
      `select e.id, e.queue_id, e.token_code, e.seq, e.status, e.counter_id, e.notes, e.source, e.guest_name,
              e.joined_at, e.called_at, e.serving_at, u.full_name, q.name as queue_name, q.grace_sec, q.is_express
         from queue_entries e
         join queues q on q.id = e.queue_id
         left join users u on u.id = e.user_id
        where e.business_id = $1 and e.service_date = $2 and e.status in ('WAITING','CALLED','SERVING')
        order by e.joined_at`,
      [businessId, todayIST()],
    ),
  ]);
  res.json({ counters, queues, entries });
});

staffRouter.post('/counters/:id/call-next', requireAuth, async (req, res) => {
  const counterId = param(req.params, 'id');
  await assertMember(req.user, await businessOf('counters', counterId), 'staff');
  res.json({ entry: await fn('call_next', { p_counter_id: counterId, p_actor: req.user.id }) });
});

// action in the URL → target status + expected current status
const ACTIONS = {
  start: { to: 'SERVING', from: 'CALLED' },
  complete: { to: 'COMPLETED', from: 'SERVING' },
  skip: { to: 'SKIPPED', from: 'CALLED' },
  'no-show': { to: 'NO_SHOW', from: 'CALLED' },
  recall: { to: 'CALLED', from: 'CALLED' },
};

staffRouter.post('/entries/:id/:action', requireAuth, async (req, res, next) => {
  const action = ACTIONS[req.params.action];
  if (!action) return next(); // unknown action → 404
  const entryId = param(req.params, 'id');
  await assertMember(req.user, await businessOf('queue_entries', entryId), 'staff');
  const entry = await fn('transition_entry', { p_entry_id: entryId, p_to: action.to, p_actor: req.user.id, p_from: action.from });
  res.json({ entry });
});

staffRouter.patch('/queues/:id/status', requireAuth, async (req, res) => {
  const queueId = param(req.params, 'id');
  const { status } = parse(z.object({ status: z.enum(['open', 'paused', 'closed']) }), req.body);
  await assertMember(req.user, await businessOf('queues', queueId), 'staff');
  await fn('set_queue_status', { p_queue_id: queueId, p_status: status, p_actor: req.user.id });
  res.json({ status });
});

const broadcastBody = z
  .object({
    message: z.string().trim().min(1).max(280),
    fromSeq: z.number().int().positive().optional(),
    toSeq: z.number().int().positive().optional(),
  })
  .refine((b) => !b.fromSeq || !b.toSeq || b.fromSeq <= b.toSeq, { message: '"from" must be before "to"' });

staffRouter.post('/queues/:id/broadcasts', requireAuth, async (req, res) => {
  const queueId = param(req.params, 'id');
  const b = parse(broadcastBody, req.body);
  await assertMember(req.user, await businessOf('queues', queueId), 'staff');
  const row = await one(
    `insert into broadcasts (queue_id, sender_id, message, from_seq, to_seq) values ($1, $2, $3, $4, $5)
     returning id, queue_id, message, from_seq, to_seq, created_at`,
    [queueId, req.user.id, b.message, b.fromSeq ?? null, b.toSeq ?? null],
  );
  await query(`insert into queue_events (queue_id, type, actor_id, payload) values ($1, 'BROADCAST', $2, $3)`, [
    queueId,
    req.user.id,
    JSON.stringify({ message: b.message }),
  ]);
  res.status(201).json({ broadcast: row });
});
