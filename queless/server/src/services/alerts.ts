import { env } from '../config/env.js';
import { fnRows } from '../db/pool.js';
import { emailTemplate, esc, sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

/**
 * "Your turn is near" (position <= 3).
 * take_near_alerts() atomically flags the entries and writes in-app
 * notifications (so two servers never double-alert); Node only sends emails.
 */
export async function processNearAlerts(queueId = null) {
  try {
    const due = await fnRows('take_near_alerts', { p_queue_id: queueId });
    const origin = env.frontendOrigins[0];
    await Promise.all(
      due
        .filter((a) => a.email)
        .map((a) =>
          sendEmail({
            to: a.email,
            subject: `⏰ ${a.token_code}: you're #${a.position} at ${a.business_name}`,
            html: emailTemplate(
              `You're almost up, ${a.full_name || 'there'}!`,
              `Token <b>${esc(a.token_code)}</b> is now <b>#${a.position}</b> in line at <b>${esc(a.business_name)}</b>. Please head over so you don't miss your call.`,
              { label: 'Track live', url: `${origin}/t/${a.entry_id}` },
            ),
          }),
        ),
    );
  } catch (e) {
    logger.warn({ e }, 'near-alert processing failed');
  }
}
