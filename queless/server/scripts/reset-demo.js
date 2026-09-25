/**
 * Resets today's demo scenario (docs/QUELESS.md §14):
 *  - clears today's tokens of the demo businesses, approves them, opens their queues
 *  - Sahyadri ENT gets 11 walk-ins (RED), Karve ENT gets 1 (GREEN alternative)
 */
import { fn, pool, query } from '../src/db/pool.js';
import { todayIST } from '../src/lib/validate.js';

const pad = (n) => String(n).padStart(12, '0');
const BUSINESSES = Array.from({ length: 12 }, (_, i) => `b0000000-0000-4000-8000-${pad(i + 1)}`);
const QUEUES = Array.from({ length: 17 }, (_, i) => `a0000000-0000-4000-8000-${pad(i + 1)}`);
const [ENT, KARVE] = QUEUES;
const today = todayIST();

await query('update counters set current_entry_id = null where business_id = any($1::uuid[])', [BUSINESSES]);
await query('delete from queue_entries where queue_id = any($1::uuid[]) and service_date = $2', [QUEUES, today]);
await query('delete from queue_day_seq where queue_id = any($1::uuid[]) and service_date = $2', [QUEUES, today]);
await query(`update businesses set status = 'approved' where id = any($1::uuid[])`, [BUSINESSES]);
await query(`update queues set status = 'open' where id = any($1::uuid[])`, [QUEUES]);

for (let i = 1; i <= 11; i++) {
  await fn('join_queue', { p_queue_id: ENT, p_guest_name: `Walk-in ${i}`, p_source: 'kiosk', p_prereq_ack: ['id_proof', 'old_reports'] });
}
await fn('join_queue', { p_queue_id: KARVE, p_guest_name: 'Walk-in 1', p_source: 'kiosk', p_prereq_ack: ['id_proof'] });
for (const id of QUEUES) await fn('refresh_queue_live', { p_queue_id: id });

console.log(`✔ Demo reset for ${today}: Sahyadri ENT = 11 waiting (RED), Karve ENT = 1 waiting (GREEN).`);
await pool.end();
