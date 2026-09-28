import 'dotenv/config';
import { z } from 'zod';

// Validate environment once at boot so a missing value fails fast and loudly.
const schema = z.object({
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(10, 'DATABASE_URL is required (Postgres connection string)'),
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 random characters'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  COOKIE_CROSS_SITE: z.enum(['true', 'false']).default('false'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('QueLess <onboarding@resend.dev>'),
  JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid server environment. Copy server/.env.example to server/.env and fill it in.');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

const e = parsed.data;
const isLocalDb = /@(localhost|127\.0\.0\.1)|host=\/|@\//.test(e.DATABASE_URL);

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  jobsEnabled: e.JOBS_ENABLED === 'true',
  crossSiteCookies: e.COOKIE_CROSS_SITE === 'true',
  dbSsl: e.DATABASE_SSL === 'true' || (e.DATABASE_SSL === 'auto' && !isLocalDb),
  frontendOrigins: e.FRONTEND_URL.split(',').map((s) => s.trim().replace(/\/$/, '')),
};
