import cron from 'node-cron';
import { fn } from '../db/pool.js';
import { logger } from '../lib/logger.js';

/**
 * Background jobs (inside the API process — run ONE instance with jobs on):
 *  - every 15 s : CALLED tokens past their grace period → NO_SHOW
 *  - 23:59 IST  : close all queues, cancel leftover tokens
 * Realtime pushes happen automatically through Postgres NOTIFY.
 */
export function startJobs() {
  let running = false;
  cron.schedule('*/15 * * * * *', async () => {
    if (running) return; // never overlap
    running = true;
    try {
      const expired = await fn('expire_called_entries');
      if (expired > 0) logger.info({ expired }, '⏱  auto no-show');
    } catch (e) {
      logger.error({ e }, 'expire job failed');
    } finally {
      running = false;
    }
  });

  cron.schedule(
    '59 23 * * *',
    async () => {
      try {
        logger.info({ cancelled: await fn('close_day') }, '🌙 day closed');
      } catch (e) {
        logger.error({ e }, 'close_day failed');
      }
    },
    { timezone: 'Asia/Kolkata' },
  );

  logger.info('⏲  jobs scheduled (expire every 15 s, close_day 23:59 IST)');
}
