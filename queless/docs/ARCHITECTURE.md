# QueLess — How it all fits together

Every part of the project, how the parts talk to each other, and how to explain it (viva, demo, new teammate). Read it once top to bottom, then practise with the Q&A at the end.

---

## 1. The 30-second pitch

> QueLess is a **digital token machine on your phone**. Customers find nearby clinics, banks or offices with a **live crowd colour**, tick the documents they need, join remotely and get a token like **E-014**. The page shows *"You're #4 · ~12 min"* and updates by itself. Staff run the line from a **counter console**, a **TV** shows *Now Serving*, and a **kiosk tablet** gives tokens to walk-ins. Unlike single-business tools (Qmatic, Qminder), QueLess is **customer-first and multi-business**: search across places, need-based search ("ear pain" → ENT), and "less crowded nearby" suggestions.

---

## 2. The three parts

```
 ┌──────────────────────────┐   HTTPS  /api/*  (cookie: ql_sid)   ┌──────────────────────────┐   SQL (pg pool)  ┌──────────────────────┐
 │  web/  React (browser)   │ ──────────────────────────────────► │  server/  Node + Express │ ───────────────► │ PostgreSQL + PostGIS │
 │  Vercel                  │ ◄── Socket.IO (live pushes) ─────── │  Render                  │ ◄── LISTEN ───── │ (Supabase / Neon /   │
 └──────────────────────────┘                                     │  + cron jobs, emails     │     NOTIFY       │  local)              │
                                                                  └──────────────────────────┘                  └──────────────────────┘
```

| Part | Folder | Runs where | Job |
|---|---|---|---|
| **Frontend** | `web/` | the user's browser | Every screen. Calls the API, listens for live updates |
| **Backend** | `server/` | a Node.js server | Login sessions, permissions, validation, all reads and writes, realtime fan-out, timed jobs, emails |
| **Database** | `database/` | PostgreSQL | Stores everything. The **queue rules live here as SQL functions** so they are atomic |

### The rule that keeps it simple
> **Browser → Node → Postgres.** The browser never touches the database.

- The API decides **who you are** (session) and **what you may do** (roles, business membership).
- Every queue change runs inside **one Postgres function = one transaction**, so two requests at the same moment can't corrupt a queue.
- The database announces every change with **NOTIFY**; Node forwards it to browsers with **Socket.IO**.

---

## 3. Session authentication (how login works)

```
 Browser                              Node (express-session)                      Postgres
   │ POST /api/auth/login {email,pw}    │                                             │
   │ ─────────────────────────────────► │ bcrypt.compare(pw, users.password_hash)     │
   │                                    │ session.regenerate()  (new id → no fixation) │
   │                                    │ session.userId = user.id ─────────────────► │ INSERT user_sessions(sid, sess, expire)
   │ ◄── Set-Cookie: ql_sid=<signed id>; HttpOnly; SameSite=Lax; Secure(prod)        │
   │                                    │                                             │
   │ GET /api/me/entries  (cookie sent automatically)                                 │
   │ ─────────────────────────────────► │ read sid → load session → req.user ───────► │ SELECT … FROM users WHERE id=…
```

| Piece | Where | Why |
|---|---|---|
| `users` table | `database/migrations/…0001_schema.sql` | our own accounts: email, **bcrypt hash** (never the password), role, blocked flag |
| `user_sessions` table | same | server-side session store (`connect-pg-simple`). Survives restarts, works with several servers |
| `ql_sid` cookie | `server/src/middleware/session.js` | **httpOnly** (JavaScript can't read it, so XSS can't steal it), signed with `SESSION_SECRET`, 7-day rolling expiry, `Secure` in production |
| `requireAuth` | `server/src/middleware/auth.js` | loads the user **from the DB on every request**, so blocking or role changes apply instantly |
| `csrfGuard` | `server/src/middleware/csrf.js` | cookies are sent automatically, so every write must carry the header `X-Requested-With: queless` and come from our origin. A malicious site can't add that header |
| Rate limits | `server/src/middleware/rateLimit.js` | 10 logins / 15 min per IP (brute force), 20 joins / min |
| Timing-safe login | `routes/auth.js` | unknown emails are still bcrypt-compared against a dummy hash, so response time doesn't reveal which emails exist |
| Logout | `POST /api/auth/logout` | deletes the session row + clears the cookie. Changing password or being blocked deletes the user's other sessions too |

**Why sessions instead of JWT?** A session can be revoked instantly (logout, block), the cookie holds nothing readable, and there's no token for JavaScript to store in `localStorage`. The trade-off is one DB lookup per request, which is cheap here.

**Socket.IO shares the same session**: `io.engine.use(sessionMiddleware)` lets the websocket read the cookie, so a logged-in user automatically joins their private `user:<id>` room (notifications), and only members can join `business:<id>` (console).

**Guests & kiosks** don't log in:
- **QR guests** get a random device id (`ql_device` cookie + `X-Device-Id` header), limited to 2 active tokens per category, plus a `claim_code` to open their tracker.
- **Kiosks** send a secret key (`X-Kiosk-Key`); the server stores only its **SHA-256 hash**.

---

## 4. The database (`database/`)

| File | What's inside |
|---|---|
| `migrations/…0001_schema.sql` | Extensions (PostGIS, pg_trgm, pgcrypto), helpers, all tables and indexes (users, sessions, files, businesses, queues, tokens…) |
| `migrations/…0002_queue_engine.sql` | **The queue engine**: `join_queue`, `call_next`, `transition_entry`, `refresh_queue_live`, `expire_called_entries`, `close_day`, `take_near_alerts`, `search_businesses`, `queue_alternatives`, analytics, and the NOTIFY triggers |
| `migrations/…0003_lockdown.sql` | Enables RLS with no policies on every table, so Supabase's public REST API sees nothing if you host there. Only our server connects |
| `seed.sql` | 6 categories, ~47 need keywords, 35 Pune pincodes, 12 businesses, 17 queues, 16 counters, 4 demo users (bcrypt via pgcrypto), a crowd of walk-ins |
| `tests/engine_tests.sh` | proves the concurrency guarantees on a real Postgres |

`npm run db:setup` (in `server/`) runs the three migrations and the seed in order.

### Main tables
```
users ─┬─< business_members >─┬─ businesses ─┬─< services
       │                      │              ├─< queues ──┬─< queue_entries   (one row = one token)
       │                      │              │            ├── queue_live      (one public row per queue)
       │                      │              │            ├─< broadcasts
       │                      │              │            └─< queue_events    (append-only log)
       │                      │              ├─< counters >─< counter_queues
       │                      │              └─< kiosk_devices
       ├─< notifications                     └── files (logo, KYC)
       └── user_sessions
categories ─< need_keywords      pincodes      queue_day_seq (token counter per queue per day)
```

### Token lifecycle (state machine)
```
WAITING ──call──► CALLED ──start──► SERVING ──complete──► COMPLETED
   │                │  ├─ recall (stays CALLED, timer restarts)
   │                │  ├─ skip ──────────► SKIPPED
   │                │  └─ grace over ────► NO_SHOW   (automatic, cron job)
   └── customer leaves ──► CANCELLED
```
`transition_entry()` whitelists these moves; anything else raises **STATE_CONFLICT** (HTTP 409).

### The three hard problems
**① Same-second joins, same number?** No:
```sql
insert into queue_day_seq (queue_id, service_date, last_seq) values ($1, today, 1)
on conflict (queue_id, service_date) do update set last_seq = queue_day_seq.last_seq + 1
returning last_seq;
```
One statement; the row lock serialises joins for the same queue. **Tested: 200 parallel joins → 1..200, no duplicates, no gaps.**

**② Two counters press "Call next" together, same person?** No: `SELECT … FOR UPDATE SKIP LOCKED`. The second counter skips the locked row and takes the next one. **Tested: 20 rounds.**

**③ Someone leaves a 50-person line: update 49 positions?** No. Positions are **not stored**. `refresh_queue_live()` rewrites **one row** holding the ordered list of waiting token codes; each phone computes `position = index + 1`. One write, one push.

### ETA & crowd colour
- `ETA = ceil(position ÷ active counters) × average service time`, where the average is an **EWMA** updated on each completion: `new = 0.3 × this + 0.7 × old`.
- 🟢 0–3 waiting · 🟡 4–9 · 🔴 10+ (same constants in SQL `traffic_for` and `web/src/lib/traffic.js`). Always shown with a text label and a shape, not colour alone.

### Search: "ear pain near 411038"
Pincode → lat/lng; **PostGIS** `ST_DWithin` keeps places within the radius (GIST index). **Need keywords** fuzzy-match (pg_trgm) "ear pain" → service tag `ENT` → businesses with an ENT service; the card shows *"matched: ear pain → ENT"*. `queue_alternatives()` finds the same kind of service nearby with fewer people waiting.

---

## 5. Realtime: how a phone updates within a second

```
 staff presses N ──► POST /api/counters/:id/call-next ──► call_next() ──► refresh_queue_live()
                                                                            └─ pg_notify('queue_live', {queue_id})
 server/src/services/realtime.js  (dedicated connection: LISTEN queue_live, broadcast, notification)
     └─► SELECT the new queue_live row ──► io.to('queue:<id>').emit('queue_live', row)      → phones, TV, discover cards
                                        └─► io.to('business:<id>').emit('entries_changed') → counter consoles
                                        └─► take_near_alerts()  → notifications (+ emails) → io.to('user:<id>')
```

Why NOTIFY from the database instead of emitting from the route handler?
- It also catches changes made by **cron jobs**, seed scripts or psql.
- With **several API servers**, every one of them hears the NOTIFY and updates its own connected clients.
- NOTIFY is delivered **only after COMMIT**, so browsers never see a change that later rolled back.

On the client, `web/src/hooks/useQueueLive.js`: (1) `GET /api/live?ids=…`, (2) join rooms via `web/src/lib/socket.js`, (3) merge pushed rows by `version`, (4) on reconnect or tab focus, refetch and keep the newer `version`. The socket helper remembers subscriptions and re-joins rooms after every reconnect (rooms are lost when a connection drops).

---

## 6. The backend (`server/`)

```
server/src/
├── index.js               HTTP server + Socket.IO + jobs
├── app.js                 middleware chain + routers + error handler
├── config/env.js          validates .env with Zod (fails fast)
├── db/pool.js             pg pool, query/one/many, fn() = call a SQL function, tx()
├── lib/                   errors ({code,message} + DB→HTTP mapping), validate (Zod), email (Resend), logger
├── middleware/            session, csrf, auth (requireAuth/requireRole/assertMember), kiosk, rateLimit
├── routes/
│   ├── auth.js            register · login · logout · me · profile · password
│   ├── public.js          categories · pincodes · search · business page · live · broadcasts · stats · display
│   ├── queue.js           join · guest QR join · tracker · leave · my tokens · notifications
│   ├── staff.js           console data · call-next · start/complete/skip/no-show/recall · status · broadcasts
│   ├── business.js        onboarding · services · queues · counters · staff · kiosks · analytics
│   ├── files.js           upload (multer, 2 MB) · download (logo public, KYC private)
│   ├── kiosk.js           kiosk setup · queues · walk-in join
│   └── admin.js           approvals · categories/keywords · users (block) · stats + CSV
├── services/realtime.js   Socket.IO rooms + Postgres LISTEN
├── services/alerts.js     "your turn is near" emails
└── jobs/index.js          every 15 s auto no-show · 23:59 IST close day
```

A write request passes: `helmet` → `cors` (only our origin, with credentials) → JSON parser → cookie parser → **session** → rate limit → **CSRF guard** → route (`requireAuth` → `assertMember` → **Zod** validation → SQL function) → `{ code, message }` on errors.

SQL errors raised by the engine (`raise_app('TOKEN_LIMIT_REACHED', 'You can hold at most 2…')`) become HTTP responses like `429 {"code":"TOKEN_LIMIT_REACHED","message":"…"}` in `lib/errors.js`.

---

## 7. The frontend (`web/`)

```
web/src/
├── main.jsx · App.jsx     providers + all routes (lazy-loaded)
├── index.css              ⭐ the theme: tokens, cards, buttons, windows, motion, dark mode
├── lib/                   api.js (fetch + cookie + CSRF header), socket.js, traffic.js, cookies.js, format.js, sound.js
├── hooks/                 useAuth (session), useQueueLive, useRealtime, useScroll (Lenis, in-view, progress)
├── components/            ui.jsx (kit), Motion.jsx (Reveal, PixelShapes, ScrollProgress), Layout, BusinessCard, MapView, Charts
└── pages/                 Landing, Discover, BusinessPage, JoinQueue, Tracker, MyTokens, Notifications, Auth,
                           Kiosk, Display, biz/* (Overview, Console, Queues, Setup, Analytics, Onboard), admin/*
```

### Design system
"Editorial neo-brutal": warm cream paper with a faint dot grid, soft **lime + lavender glows**, heavy **Fraunces** serif headlines, **Inter** body text, **JetBrains Mono** for tokens and URLs. Surfaces are rounded white cards with a **hard black offset shadow**, lime pills, orange icon tiles, and dark **"terminal window"** panels with traffic-light dots (hero ticket, tracker, console, business header). All colours are CSS variables, so dark mode only swaps variables.

### Motion (`components/Motion.jsx`, `hooks/useScroll.js`)
- **Smooth scrolling** with Lenis (turned off for people who prefer reduced motion).
- **Reveal**: sections rise and fade in as they enter the viewport (IntersectionObserver).
- **Pixel dissolve**: with `pixel`, a grid of squares covers a card and pops away cell by cell in random order.
- **PixelShapes**: tetromino-like pixel clusters pop in square by square, then **drift up at different speeds as you scroll** (parallax via a CSS variable updated in `requestAnimationFrame`).
- A pixel **scroll-progress bar** at the top, and a navbar that blurs and shrinks once you scroll.
- All of it respects `prefers-reduced-motion`.

### Screens
| Route | Who | What |
|---|---|---|
| `/` | everyone | hero with live ticket window, live desk stats, business band, how it works, categories, rules, stories, FAQ |
| `/discover` | everyone | need search, pincode/GPS, radius, filters, map, live crowd badges |
| `/b/:slug` | everyone | business page, queues with live counts, hours, map |
| `/q/:id/join`, `/join/:id` | customer / QR guest | **gatekeeper** checklist + notes; 🔴 → alternatives |
| `/t/:id` | owner / guest / kiosk ticket | **live tracker**; full-screen "Go to Counter 2" with chime, vibration and grace countdown |
| `/me/tokens`, `/me/notifications` | customer | tokens + inbox |
| `/biz/*` | members | overview, **console** (N/S/C/K/X/R), queues + QR poster, services, counters, staff, kiosks, analytics |
| `/kiosk`, `/display/:slug` | devices | walk-in tokens · TV board |
| `/admin/*` | admin | approvals + KYC, categories/keywords, users, stats + CSV |

---

## 8. One token through every layer

1. **Riya searches** "ear pain" → `GET /api/search` → `search_businesses()` → cards subscribe to `queue:<id>` rooms.
2. **Riya joins** → `POST /api/queues/:id/join` (cookie + CSRF header) → `requireAuth` → Zod → `join_queue()` checks open/approved/documents/2-token limit, takes seq 14 atomically, inserts **E-014**, refreshes `queue_live` → NOTIFY → Socket.IO push → the TV and every phone update.
3. **Tracker** finds `E-014` at index 3 of `waiting` → *"You're #4 · ~12 min"*.
4. **Someone ahead leaves** → `transition_entry(→CANCELLED)` → push → Riya is **#3** → `take_near_alerts()` inserts a notification → NOTIFY → her bell rings (+ email).
5. **Staff presses N** → `call_next()` (`SKIP LOCKED`) → `now_serving=[Counter 2: E-014]` → Riya's phone turns **lime full-screen: "Go to Counter 2"**; the TV flips and chimes.
6. **Start → Complete** → EWMA updated → everyone's ETA improves.
7. If she never comes → the **15-second job** marks NO_SHOW and frees the counter.

---

## 9. Viva / interview Q&A

**Q: Why session auth and not JWT?** Sessions are revocable instantly (logout, block, password change), the cookie is httpOnly and contains nothing readable, and there's no token in localStorage for XSS to steal. Cost: one indexed DB lookup per request.

**Q: How are passwords stored?** bcrypt with cost 12 (random salt per password). We never store or log the plain password. Login compares with a dummy hash for unknown emails to avoid timing leaks.

**Q: How do you stop CSRF when cookies are sent automatically?** `SameSite=Lax` cookies + every write needs the `X-Requested-With: queless` header + an Origin check. A foreign site can't set that header without a CORS preflight, which our CORS config rejects.

**Q: What is session fixation and how do you prevent it?** An attacker plants a known session id before login. We call `session.regenerate()` at login, so the id changes.

**Q: How do you prevent duplicate token numbers?** A single `INSERT … ON CONFLICT DO UPDATE … RETURNING` on `queue_day_seq`; the row lock serialises joins. Tested with 200 parallel joins.

**Q: Two counters calling the same person?** `SELECT … FOR UPDATE SKIP LOCKED`.

**Q: Why not store each position?** Leaves would rewrite N rows and send N messages. We keep one ordered list per queue; each phone computes `index + 1`.

**Q: How does realtime work?** SQL functions `pg_notify` after changes → Node LISTENs on a dedicated connection → Socket.IO emits to rooms (`queue:`, `business:`, `user:`). It works across multiple servers, and only fires after COMMIT.

**Q: What if a phone loses signal?** On reconnect the socket re-joins its rooms and the page refetches `queue_live`, keeping the higher `version`.

**Q: How do guests and kiosks authenticate?** Guests: device id (2-token limit) + claim code for their tracker; they must scan the poster at the venue. Kiosks: a random key shown once; only its SHA-256 hash is stored, and it's revocable.

**Q: What can the public TV see?** Token codes, counters and counts. Never names.

**Q: What's automated?** Auto no-show every 15 s, end-of-day cleanup at 23:59 IST, and turn-near alerts after every change.

**Q: Limitations / next steps?** Jobs run in one Node instance (move to `pg_cron` or a worker to scale); files are stored in Postgres (fine for 2 MB logos/KYC; use S3 for scale); no password-reset email yet; next up are push notifications, SMS/WhatsApp, reservations, Hindi/Marathi and ML wait prediction compared against the EWMA baseline.
