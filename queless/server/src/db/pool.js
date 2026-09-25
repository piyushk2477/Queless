import pg from 'pg';
import { env } from '../config/env.js';
import { fromDb } from '../lib/errors.js';

// Parse numbers as numbers and dates as 'YYYY-MM-DD' strings (not JS Dates).
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10)); // int8 / count(*)
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v)); // numeric
pg.types.setTypeParser(1082, (v) => v); // date

export const poolConfig = {
  connectionString: env.DATABASE_URL,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
};

// One connection pool for the whole API. Only the server ever connects.
export const pool = new pg.Pool({ ...poolConfig, max: 10, idleTimeoutMillis: 30_000 });

/** Run SQL with $1..$n params; DB errors become AppErrors. */
export async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (e) {
    throw fromDb(e);
  }
}

export const many = async (text, params) => (await query(text, params)).rows;
export const one = async (text, params) => (await query(text, params)).rows[0] ?? null;

/**
 * Call a Postgres function with named arguments:
 *   fn('join_queue', { p_queue_id: id, p_source: 'app' })
 * `name` is always a constant from our code (never user input).
 */
export async function fn(name, args = {}) {
  const keys = Object.keys(args);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' && !(args[k] instanceof Date) ? JSON.stringify(args[k]) : args[k]));
  const row = await one(`select public.${name}(${list}) as result`, values);
  return row?.result ?? null;
}

/** Same, for functions that RETURN TABLE. */
export async function fnRows(name, args = {}) {
  const keys = Object.keys(args);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const values = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  return many(`select * from public.${name}(${list})`, values);
}

/** Run several statements in one transaction. */
export async function tx(work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw fromDb(e);
  } finally {
    client.release();
  }
}
