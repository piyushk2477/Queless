import { one } from '../db/pool.js';
import { err } from '../lib/errors.js';

/** Load the logged-in user from the session (fresh from the DB every request). */
async function loadUser(req) {
  const userId = req.session?.userId;
  if (!userId) return null;
  const u = await one('select id, email, full_name, phone, role, is_blocked from users where id = $1', [userId]);
  if (!u || u.is_blocked) {
    req.session.destroy(() => {});
    if (u?.is_blocked) throw err.forbidden('Your account is blocked. Contact support.');
    return null;
  }
  return { id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role };
}

export async function requireAuth(req, _res, next) {
  if (!req.user) req.user = await loadUser(req);
  if (!req.user) throw err.unauthorized();
  next();
}

/** Attach req.user when logged in, but don't require it. */
export async function optionalAuth(req, _res, next) {
  if (!req.user) req.user = await loadUser(req).catch(() => null);
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw err.unauthorized();
    if (!roles.includes(req.user.role)) throw err.forbidden();
    next();
  };
}

// ---------------------------------------------------------------------------
// Business membership (admin > owner/manager > staff)
// ---------------------------------------------------------------------------

/** 'manager' | 'staff' | null for this user in this business. */
export async function memberRole(user, businessId) {
  if (!user) return null;
  if (user.role === 'admin') return 'manager';
  const row = await one(
    `select case when b.owner_id = $2 then 'manager' else m.role end as role
       from businesses b
       left join business_members m on m.business_id = b.id and m.user_id = $2
      where b.id = $1`,
    [businessId, user.id],
  );
  if (!row) throw err.notFound('Business');
  return row.role ?? null;
}

export async function assertMember(user, businessId, min = 'staff') {
  const role = await memberRole(user, businessId);
  if (!role) throw err.forbidden('You are not a member of this business');
  if (min === 'manager' && role !== 'manager') throw err.forbidden('Only managers can do this');
  return role;
}

const OWNED_TABLES = { queues: 'Queue', counters: 'Counter', services: 'Service', queue_entries: 'Token', kiosk_devices: 'Kiosk' };

/** Which business does this queue / counter / service / token / kiosk belong to? */
export async function businessOf(table, id) {
  if (!OWNED_TABLES[table]) throw new Error(`bad table ${table}`);
  const row = await one(`select business_id from ${table} where id = $1`, [id]);
  if (!row) throw err.notFound(OWNED_TABLES[table]);
  return row.business_id;
}
