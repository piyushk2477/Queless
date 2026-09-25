# 🚦 QueLess — *Join the queue, not the crowd*

Web platform for joining a business's queue remotely, tracking your live position and getting called when it's your turn.

```
queless/
├── web/        React + Vite (JavaScript/JSX) + Tailwind   → the website (customer, business console, kiosk, TV, admin)
├── server/     Node.js + Express (JavaScript)             → the API: session login, all data, rules, realtime, jobs
├── database/   SQL migrations + seed                      → PostgreSQL + PostGIS (tables + the queue engine)
└── docs/
    ├── ARCHITECTURE.md   ⭐ how every part connects + how to explain it (viva Q&A)
    ├── SETUP-WINDOWS.md  the same steps with Windows notes
    └── QUELESS.md        the original build spec
```

**Frontend and backend are separate apps**: each has its own `package.json`, and they can be deployed separately. The browser only ever talks to the Node API (REST + Socket.IO); only the API talks to the database.

**Login = session auth.** After login the server stores the session in Postgres and gives the browser an **httpOnly cookie** (`ql_sid`) holding only a random, signed id. Passwords are **bcrypt**-hashed.

---

## 1. What you need

| Tool | Version | Check |
|---|---|---|
| Node.js | 20+ (22 LTS recommended) | `node -v` |
| PostgreSQL **with PostGIS** | 14+ | see options below |

Pick **one** database option:
- **A. Supabase (easiest, free):** create a project at https://supabase.com. It already has PostGIS. Copy **Project → Connect → Session pooler** (or *Direct connection*) URI.
  ⚠ Don't use the *Transaction pooler* (port 6543): live updates use Postgres LISTEN/NOTIFY, which needs a session connection.
- **B. Local Postgres:** install PostgreSQL + PostGIS (Windows: tick *PostGIS* in the StackBuilder step; macOS: `brew install postgresql postgis`; Ubuntu: `sudo apt install postgresql postgresql-16-postgis-3`). Then create a database: `createdb queless`.
- **C. Neon / Railway / Render Postgres:** anything with PostGIS works.

---

## 2. Run the backend (server/)

```bash
cd server
cp .env.example .env         # Windows: copy .env.example .env
```
Edit `server/.env`:
- `DATABASE_URL`: your connection string
- `SESSION_SECRET`: 64 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

```bash
npm install
npm run db:setup             # creates all tables + functions + demo data (run once, on an empty database)
npm run dev                  # → http://localhost:4000/health  shows {"ok":true}
```

Demo logins (password for all: **`Queless@123`**)

| Email | Role | Try |
|---|---|---|
| `customer@queless.dev` | customer | `/discover`, join a queue, `/me/tokens` |
| `manager@queless.dev` | manager of *Sahyadri ENT Clinic* | `/biz` → everything |
| `staff@queless.dev` | staff of *Sahyadri ENT Clinic* | `/biz` → Counter console |
| `admin@queless.dev` | platform admin | `/admin` |

`npm run demo:reset` puts today's demo back to the §14 scenario: the ENT clinic crowded 🔴 with 11 people, and a 🟢 alternative 1.8 km away. Run it before every demo, because token numbers restart daily.

## 3. Run the frontend (web/)

In a **second terminal**:
```bash
cd web
npm install
npm run dev                  # → http://localhost:5173
```
No `.env` is needed in development: Vite forwards `/api` and `/socket.io` to `localhost:4000`, so the website and API share one origin and the session cookie just works.

Shortcut from `queless/`: `npm run install:all`, then `npm run dev:server` and `npm run dev:web` in two terminals.

---

## 4. Demo script (5–7 min)

| # | Do this | Where |
|---|---|---|
| 1 | **Admin** → Approvals → approve a pending business (register one first as manager at `/biz/onboard`) | `/admin` |
| 2 | **Customer**: pincode `411038`, search **"ear pain"** → *Sahyadri ENT* is 🔴 → Join → the page suggests 🟢 *Karve Road ENT* 1.8 km away | `/discover` |
| 3 | Tick the documents (Join is disabled until then), add ♿, join → token **E-0xx** | `/q/:id/join` |
| 4 | **Manager**: Kiosks → create key → open `/kiosk` in another tab → paste → tap ENT OPD → ticket with QR. Queues → **QR poster** → open the link in a private window (guest join) | `/biz/...` |
| 5 | **Staff**: Counter console → press **N**. The ♿ tag shows; the TV (`/display/sahyadri-ent-kothrud`) and the customer's phone update instantly | console |
| 6 | Customer presses **Leave queue** → everyone behind moves up live | `/t/:id` |
| 7 | Staff broadcasts *"Doctor delayed 10 min"* → phones + TV ticker | console |
| 8 | Call someone and don't press Start → after the grace period they become **NO-SHOW** automatically (set grace to 0.5 min in Queues for the demo) | console |
| 9 | Analytics: served, average wait, per counter, busy-hours heatmap | `/biz/:id/analytics` |

Console shortcuts: **N** call next · **S** start · **C** complete · **K** skip · **X** no-show · **R** recall.

---

## 5. Tests

```bash
cd web && npm test                               # position / ETA / crowd-colour logic
cd server && npm test                            # unit tests (+ integration tests when a test DB is given):
TEST_DATABASE_URL=postgres://... npm test        # login/logout, CSRF, permissions, join → call → realtime push, guest QR, onboarding
PGURL=postgres://... ./database/tests/engine_tests.sh   # 200 parallel joins, 2 counters never call the same person, illegal moves rejected
```
⚠ Point the integration and engine tests at a **test** database (created with `npm run db:setup`), never production.

---

## 6. Deploy (free tiers)

**Database**: Supabase / Neon / Railway Postgres → `npm run db:setup` once from your laptop with that `DATABASE_URL`.

**API → Render** (Web Service): root `queless/server`, build `npm install`, start `npm start`. Environment:
`NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_URL=https://<your-web-domain>`, optional `RESEND_API_KEY`. Run **one** instance (the jobs live inside it).

**Web → Vercel**: root `queless/web`, framework *Vite*. Then choose how the browser reaches the API:
- ✅ **Recommended: same origin.** Edit `web/vercel.json` and replace `YOUR-API.onrender.com` with your API host. Vercel then forwards `/api/*` and `/socket.io/*` to Render, so the cookie stays first-party. Leave `VITE_API_URL` empty and keep `COOKIE_CROSS_SITE=false`.
- **Different domains**: set `VITE_API_URL=https://your-api.onrender.com` on Vercel and `COOKIE_CROSS_SITE=true` on the API (cookies become `SameSite=None; Secure`). Some browsers block third-party cookies, which is why same-origin is recommended.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Server exits with *Invalid server environment* | a variable in `server/.env` is missing; the message lists which |
| `db:setup`: *type "geography" does not exist* / *extension "postgis" is not available* | install PostGIS for your Postgres (Supabase already has it) |
| `db:setup`: *already exists* | the database isn't empty; drop and recreate it (or use a new one) |
| "Cannot reach the QueLess server" | API not running on :4000 |
| Login works but you're logged out on refresh | cross-domain setup without `COOKIE_CROSS_SITE=true`, or the browser blocks third-party cookies. Use the same-origin rewrite |
| `{"code":"CSRF"}` | requests must come from the web app (it sends `X-Requested-With`), and `FRONTEND_URL` must match the site's origin exactly |
| Crowd colours don't update live | `DATABASE_URL` points at a transaction pooler (port 6543). Use the session/direct connection |
| Tokens from yesterday still show | `npm run demo:reset` (the 23:59 IST job normally cleans up) |
| Map is grey | your network blocks OpenStreetMap tiles; everything else still works |
