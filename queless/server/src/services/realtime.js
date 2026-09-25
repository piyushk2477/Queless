import pg from 'pg';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env.js';
import { one, poolConfig } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { memberRole } from '../middleware/auth.js';
import { processNearAlerts } from './alerts.js';

/**
 * Realtime = Postgres LISTEN/NOTIFY  →  Node  →  Socket.IO rooms  →  browsers
 *
 *   room queue:<id>     public   queue_live rows + broadcasts (token codes only)
 *   room business:<id>  members  "entries changed" pings for the counter console
 *   room user:<id>      owner    in-app notifications
 *
 * The database announces every change (refresh_queue_live, broadcast and
 * notification triggers), so updates reach browsers no matter who made the
 * change: an API request, a cron job, or even psql.
 */
let io = null;

export function getIO() {
  return io;
}

export function initRealtime(httpServer, sessionMiddleware) {
  io = new Server(httpServer, {
    cors: { origin: env.frontendOrigins, credentials: true },
    serveClient: false,
  });
  io.engine.use(sessionMiddleware); // same login session as the REST API

  const ids = z.array(z.guid()).max(100);

  io.on('connection', (socket) => {
    const userId = socket.request.session?.userId;
    if (userId) socket.join(`user:${userId}`);

    socket.on('subscribe', (payload) => {
      const r = ids.safeParse(payload?.queues);
      if (r.success) r.data.forEach((q) => socket.join(`queue:${q}`));
    });
    socket.on('unsubscribe', (payload) => {
      const r = ids.safeParse(payload?.queues);
      if (r.success) r.data.forEach((q) => socket.leave(`queue:${q}`));
    });
    socket.on('subscribe_business', async (payload, ack) => {
      try {
        const businessId = z.guid().parse(payload?.businessId);
        const uid = socket.request.session?.userId;
        const user = uid ? await one('select id, role from users where id = $1 and not is_blocked', [uid]) : null;
        if (!(await memberRole(user, businessId))) throw new Error('forbidden');
        socket.join(`business:${businessId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
  });

  void listen();
  return io;
}

// Coalesce bursts (e.g. close_day touches every queue) into one push per queue.
const pending = new Map();
function debounce(key, ms, fnToRun) {
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); void fnToRun(); }, ms));
}

async function onQueueLive({ queue_id: queueId, business_id: businessId }) {
  const row = await one('select * from queue_live where queue_id = $1', [queueId]);
  if (row) io.to(`queue:${queueId}`).emit('queue_live', row);
  io.to(`business:${businessId}`).emit('entries_changed', { queueId });
  await processNearAlerts(queueId); // positions moved → maybe someone is now #3
}

async function onBroadcast({ id }) {
  const row = await one('select id, queue_id, message, from_seq, to_seq, created_at from broadcasts where id = $1', [id]);
  if (row) io.to(`queue:${row.queue_id}`).emit('broadcast', row);
}

async function onNotification({ id, user_id: userId }) {
  const row = await one('select id, title, body, entry_id, read_at, created_at from notifications where id = $1', [id]);
  if (row) io.to(`user:${userId}`).emit('notification', row);
}

/** A dedicated connection that LISTENs; reconnects if the DB drops. */
async function listen() {
  const client = new pg.Client(poolConfig);
  try {
    await client.connect();
    await client.query('listen queue_live; listen broadcast; listen notification;');
    logger.info('📡 realtime: listening to Postgres notifications');
    client.on('notification', (msg) => {
      let data;
      try {
        data = JSON.parse(msg.payload ?? '{}');
      } catch {
        return;
      }
      const run = (f) => f(data).catch((e) => logger.warn({ e }, 'realtime push failed'));
      if (msg.channel === 'queue_live') debounce(`q:${data.queue_id}`, 40, () => run(onQueueLive));
      else if (msg.channel === 'broadcast') void run(onBroadcast);
      else if (msg.channel === 'notification') void run(onNotification);
    });
    client.on('error', (e) => {
      logger.error({ e }, 'realtime listener lost connection, retrying in 3 s');
      client.end().catch(() => {});
      setTimeout(listen, 3000);
    });
  } catch (e) {
    logger.error({ e }, 'realtime listener could not connect, retrying in 5 s');
    client.end().catch(() => {});
    setTimeout(listen, 5000);
  }
}
