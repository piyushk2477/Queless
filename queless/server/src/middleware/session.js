import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

const PgStore = connectPgSimple(session);

/**
 * Session auth.
 * The browser only gets a random, signed session id in an httpOnly cookie
 * (`ql_sid`). The session data (the user id) lives in Postgres
 * (table user_sessions), so logging out or blocking a user takes effect
 * immediately and sessions survive server restarts.
 */
export const sessionMiddleware = session({
  name: 'ql_sid',
  secret: env.SESSION_SECRET,
  store: new PgStore({ pool, tableName: 'user_sessions', pruneSessionInterval: env.isTest ? false : 15 * 60 }),
  resave: false,
  saveUninitialized: false, // no cookie until someone logs in
  rolling: true, // every request extends the 7 days
  proxy: env.isProd,
  cookie: {
    httpOnly: true, // JavaScript can't read it (XSS can't steal it)
    secure: env.isProd || env.crossSiteCookies, // HTTPS only in production
    sameSite: env.crossSiteCookies ? 'none' : 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  },
});

/** Promise helpers around express-session callbacks. */
export const regenerate = (req) => new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
export const save = (req) => new Promise((ok, fail) => req.session.save((e) => (e ? fail(e) : ok())));
export const destroy = (req) => new Promise((ok) => req.session.destroy(() => ok()));
