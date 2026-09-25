/**
 * Creates the whole database in one command:
 *   npm run db:setup            → migrations + seed (demo data & logins)
 *   npm run db:setup -- --no-seed
 *   npm run db:seed             → seed only
 * Uses DATABASE_URL from server/.env. Safe on an EMPTY database; to start over,
 * drop and recreate the database (or schema) first.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { poolConfig } from '../src/db/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../database');
const args = new Set(process.argv.slice(2));

const client = new pg.Client(poolConfig);
await client.connect();
await client.query('create schema if not exists extensions');
await client.query(`set search_path = public, extensions`);

async function run(file) {
  process.stdout.write(`→ ${path.relative(dbDir, file)} … `);
  await client.query(await readFile(file, 'utf8'));
  console.log('ok');
}

try {
  if (!args.has('--seed-only')) {
    const dir = path.join(dbDir, 'migrations');
    for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) await run(path.join(dir, f));
  }
  if (!args.has('--no-seed')) await run(path.join(dbDir, 'seed.sql'));
  console.log('\n✔ Database ready. Demo logins use password Queless@123 (customer@, manager@, staff@, admin@queless.dev)');
} catch (e) {
  console.error(`\n✖ ${e.message}`);
  if (/already exists/.test(e.message)) console.error('  The database is not empty. Drop and recreate it, then run again.');
  process.exitCode = 1;
} finally {
  await client.end();
}
