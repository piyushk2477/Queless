# QueLess — notes for Claude Code

Spec: `docs/QUELESS.md`. Architecture: `docs/ARCHITECTURE.md`.

## Stack (all JavaScript, ESM)
- `web/`: React 19 + Vite (JSX), Tailwind v4, React Router 7, TanStack Query, Zustand, RHF + Zod, socket.io-client, Leaflet, Recharts, Lenis, lucide-react
- `server/`: Node 20+, Express 5, pg, express-session + connect-pg-simple, bcryptjs, Socket.IO, Zod, helmet, cors, express-rate-limit, node-cron, multer, pino
- `database/`: SQL migrations (tables, queue engine functions, NOTIFY triggers, lockdown) + `seed.sql`

## Rules
- Browser → Node → Postgres. The browser never talks to the DB.
- Session auth: httpOnly `ql_sid` cookie, sessions in `user_sessions`, bcrypt hashes in `users`. Every write needs header `X-Requested-With: queless` (CSRF guard).
- Queue changes only through SQL functions (one transaction each). Realtime comes from `pg_notify` → `services/realtime.js` → Socket.IO rooms `queue:`, `business:`, `user:`.

## Token lifecycle
WAITING→CALLED→SERVING→COMPLETED; CALLED→CALLED (recall) | SKIPPED | NO_SHOW | CANCELLED; WAITING→CANCELLED. Anything else = STATE_CONFLICT (409).

## Errors
JSON `{ code, message }`. SQL raises via `raise_app(code, text)` (hint 'queless'); `server/src/lib/errors.js` maps codes → HTTP.

## Env (server/.env)
DATABASE_URL, DATABASE_SSL, SESSION_SECRET, FRONTEND_URL, COOKIE_CROSS_SITE, RESEND_API_KEY, EMAIL_FROM, PORT, JOBS_ENABLED. Web: optional VITE_API_URL (empty = same origin via Vite proxy / Vercel rewrite).

## Commands
- server: `npm run dev`, `npm run db:setup`, `npm run demo:reset`, `npm test` (integration with TEST_DATABASE_URL)
- web: `npm run dev`, `npm run build`, `npm test`
- engine: `PGURL=... database/tests/engine_tests.sh`

## Conventions
Validate every request body with Zod. Colours are CSS tokens in `web/src/index.css`, never hard-coded theme colours in components (except fixed brand ink/lime on dark panels). Crowd thresholds must match `traffic_for()` and `web/src/lib/traffic.js`. Respect `prefers-reduced-motion` for any new animation.
