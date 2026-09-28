// Session auth: register, login, logout, who-am-I, profile, password.
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../db/pool.js';
import { AppError, err } from '../lib/errors.js';
import { email, parse, password } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { destroy, regenerate, save } from '../middleware/session.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = 12;
// Compared against when the email doesn't exist, so response time doesn't
// reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

/** The shape the frontend receives for the logged-in user. */
export async function mePayload(userId) {
  const user = await one('select id, email, full_name, phone, role, created_at from users where id = $1', [userId]);
  const memberships = await many(
    `select b.id as business_id,
            case when b.owner_id = $1 then 'manager' else m.role end as role,
            b.name, b.slug, b.status, b.logo_file_id
       from businesses b
       left join business_members m on m.business_id = b.id and m.user_id = $1
      where b.owner_id = $1 or m.user_id = $1
      order by b.name`,
    [userId],
  );
  return { user, memberships };
}

/** Start a fresh session for this user (new id → prevents session fixation). */
async function logIn(req, userId) {
  await regenerate(req);
  req.session.userId = userId;
  await save(req);
  await query('update users set last_login_at = now() where id = $1', [userId]);
}

authRouter.post('/auth/register', registerLimiter, async (req, res) => {
  const body = parse(z.object({ fullName: z.string().trim().min(2, 'Your name please').max(80), email, password }), req.body);
  const exists = await one('select 1 from users where lower(email) = $1', [body.email]);
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Log in instead.');
  const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const user = await one('insert into users (email, password_hash, full_name) values ($1, $2, $3) returning id', [body.email, hash, body.fullName]);
  await logIn(req, user.id);
  res.status(201).json(await mePayload(user.id));
});

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
  const user = await one('select id, password_hash, is_blocked from users where lower(email) = $1', [body.email]);
  const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw err.unauthorized('Wrong email or password');
  if (user.is_blocked) throw err.forbidden('Your account is blocked. Contact support.');
  await logIn(req, user.id);
  res.json(await mePayload(user.id));
});

authRouter.post('/auth/logout', async (req, res) => {
  await destroy(req); // deletes the row in user_sessions
  res.clearCookie('ql_sid', { path: '/' });
  res.status(204).end();
});

/** Who am I? 200 with { user: null } when logged out (no console noise). */
authRouter.get('/auth/me', async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.json({ user: null, memberships: [] });
  const u = await one('select is_blocked from users where id = $1', [userId]);
  if (!u || u.is_blocked) {
    await destroy(req);
    return res.json({ user: null, memberships: [] });
  }
  res.json(await mePayload(userId));
});

authRouter.patch('/auth/me', requireAuth, async (req, res) => {
  const body = parse(z.object({ fullName: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional() }), req.body);
  await query('update users set full_name = $2, phone = $3 where id = $1', [req.user.id, body.fullName, body.phone || null]);
  res.json(await mePayload(req.user.id));
});

authRouter.post('/auth/password', requireAuth, loginLimiter, async (req, res) => {
  const body = parse(z.object({ current: z.string().min(1), next: password }), req.body);
  const row = await one('select password_hash from users where id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.current, row.password_hash))) throw err.validation('Current password is wrong');
  await query('update users set password_hash = $2 where id = $1', [req.user.id, await bcrypt.hash(body.next, BCRYPT_ROUNDS)]);
  // log out every OTHER session of this user
  await query(`delete from user_sessions where sess->>'userId' = $1 and sid <> $2`, [req.user.id, req.sessionID]);
  res.json({ ok: true });
});
