# QueLess — Build Document (for Claude Code)

> **Implementation note (v2):** the project is built in **JavaScript** (no TypeScript), uses **session auth**
> (express-session + bcrypt, sessions stored in Postgres) instead of Supabase Auth, and the browser talks
> **only to the Node API**. Live updates use Postgres LISTEN/NOTIFY → Socket.IO instead of Supabase Realtime,
> and files are stored in Postgres. Postgres can still be hosted on Supabase. See `docs/ARCHITECTURE.md`.

> **"Join the queue, not the crowd."**
> Web platform for joining a business's queue remotely, tracking your live position and getting called when it's your turn.
> **Stack: React + Node.js (Express) + Supabase.**

Put this file in the repo as `docs/QUELESS.md`. Every Claude Code prompt at the end refers to it.

---

## 1. The project in plain words

QueLess is like a **digital token machine** that lives on your phone:

1. A customer searches "ear pain near 411038" and sees nearby clinics, each with a **live crowd colour** (🟢 🟡 🔴).
2. They tick the required documents, join the queue, and get a token such as **E-014**.
3. They wait at home or in a café. The screen shows **"You're #4 · ~12 min"**, and it updates by itself.
4. When they're 3 away they get an alert. When called, the phone shows **"Go to Counter 2"**.
5. Staff run the queue from a dashboard with one-click buttons: **Call Next → Start → Done / Skip / No-show**.
6. A **TV at the clinic** shows "Now Serving". A **tablet at reception** gives tokens to walk-in people who have no smartphone.

---

## 2. Tech stack

| Part | Tech | Job |
|---|---|---|
| Frontend | **React + Vite + TypeScript**, Tailwind CSS, shadcn/ui, React Router | All screens: customer, business, kiosk, TV, admin |
| Server data | **TanStack Query** | Fetching and caching API data |
| UI state | **Zustand** (small) | Location, theme, current counter |
| Forms | React Hook Form + Zod | Validation |
| Maps | Leaflet + OpenStreetMap | Free maps, no billing |
| Backend | **Node.js + Express + TypeScript** | All writes and business rules, background jobs, emails, kiosk and QR APIs |
| Database | **Supabase Postgres** + PostGIS extension | Data + "within 5 km" search |
| Auth | **Supabase Auth** | Email/password + Google login, JWT sessions |
| Live updates | **Supabase Realtime** | Instant position, ETA and "Now Serving" updates |
| Files | **Supabase Storage** | Business logos (public bucket), KYC documents (private bucket) |
| Email | Resend (or Nodemailer + SMTP) | "Your turn is near", approval emails |
| Jobs | node-cron inside Node | No-show timer, midnight queue close |
| Hosting | Frontend on **Vercel**, Node on **Render/Railway**, Supabase Cloud | Free tiers work for the demo |

### The one rule that keeps it simple

> **Reads go directly to Supabase. Writes go through Node.**

- React **reads** data (businesses, queue status, my tokens) straight from Supabase. Row Level Security (RLS) decides who can see what, and Realtime pushes changes.
- React **never writes** queue data directly. Every action (join, call next, cancel, create a queue) goes to the Node API.
- Node checks permissions and rules, then calls a **Postgres function** that performs the change atomically, so two people never get the same token.
- Result: fast reads, safe writes, and no custom WebSocket server to maintain.

```
            ┌──────────────┐   reads + realtime (RLS)   ┌───────────────────────┐
  Browser ──┤  React app   ├───────────────────────────►│ Supabase              │
            │ (Vite + TS)  │                            │ Postgres + PostGIS    │
            └──────┬───────┘                            │ Auth · Realtime       │
                   │  writes (Bearer JWT)               │ Storage               │
                   ▼                                    └──────────▲────────────┘
            ┌──────────────┐  service role: RPC calls              │
            │ Node/Express ├───────────────────────────────────────┘
            │ API + jobs   │──► Email (Resend)
            └──────────────┘
```

---

## 3. What makes QueLess different

Most queue products (Qmatic, Qminder, Waitwhile-style tools) are **B2B tools for one business**. The customer only sees that one business's line. QueLess is **customer-first and multi-business**:

| Typical queue apps | QueLess |
|---|---|
| You must already know which place to go to | **Discovery across businesses**: search by area, pincode or radius with live crowd colours |
| Search by exact department name | **Need-based search**: "ear pain" → ENT, "home loan" → Mortgage desk |
| A crowded place stays crowded | **Smart distribution**: on a 🔴 queue, suggests a nearby 🟢 alternative in the same category |
| People arrive and get sent back for missing papers | **Prerequisite gatekeeper**: must tick required documents before joining |
| Free-text chat or phone calls to staff | **Structured notes → staff tags** (♿ wheelchair, 👥 party of 4), with no chat overhead |
| Generic delay announcements | **One-way broadcasts** to the whole queue or a token range ("E-010 to E-020: doctor delayed 10 min") |
| Online and walk-in users in separate systems | **One fair queue** for app users, QR-at-door guests and kiosk walk-ins |
| People hoard tokens everywhere | **Anti-spam**: max 2 active tokens per category |
| Staff manually skip absentees | **Auto no-show** after a grace period, and the next person moves up |
| Western SMS-first products | **India-first**: pincode search, low-data UI, email/in-app alerts (SMS/WhatsApp later) |

---

## 4. Users & roles

| Role | What they do |
|---|---|
| **Customer** | Search, join queues, track tokens, leave queue, view history |
| **Guest** | Joins **only by scanning the QR poster at the venue** (no signup). Limited by a device cookie. |
| **Staff** | Runs counters: call, start, complete, skip, no-show, broadcast |
| **Manager** | Everything staff can do, plus business profile, services, queues, counters, staff, kiosks, analytics |
| **Admin** (platform) | Approves businesses, manages categories and keywords, blocks users, sees platform stats |

---

## 5. Features (final list)

✅ = MVP (must be in the demo) · 🔜 = v2 (after MVP)

### 5.1 Customer
| ID | Feature | | SRS ref |
|---|---|---|---|
| C1 | Sign up / login: email+password, Google; email verification | ✅ | NFR 5.2 |
| C2 | Search by GPS or pincode, radius 2 / 5 / 10 km | ✅ | FR-1.1 |
| C3 | Categories: Healthcare, Banking & Finance, Restaurants & Hospitality, Salons & Wellness, Retail & Service Centers, Government Offices | ✅ | FR-1.1 |
| C4 | Need-based search ("ear pain" → ENT), with a "matched because" chip | ✅ | FR-1.1 |
| C5 | Filters: Wheelchair accessible, Parking, Express queue, Open now | ✅ | FR-1.1 |
| C6 | Live crowd badge per queue: 🟢 0–3 waiting · 🟡 4–9 · 🔴 10+ (with ETA) | ✅ | FR-1.2 |
| C7 | Smart distribution: "Less crowded nearby" on 🔴 queues | ✅ | — |
| C8 | Business page: services, queues, hours, amenities, map | ✅ | FR-1.2 |
| C9 | Prerequisite gatekeeper: Join button disabled until all required boxes are ticked | ✅ | — |
| C10 | Request notes: party size, accessibility needs, short text (≤140 chars) | ✅ | — |
| C11 | Join queue → token (e.g. A-042) | ✅ | FR-1.3, 1.4 |
| C12 | Live tracker: position, ETA, now serving, paused/closed banner, broadcasts | ✅ | FR-2.1–2.5 |
| C13 | "You're called" full-screen alert with sound, vibration and grace countdown | ✅ | FR-2.4 |
| C14 | Leave queue (everyone behind moves up instantly) | ✅ | FR-1.5 |
| C15 | Max 2 active tokens per category | ✅ | — |
| C16 | My tokens (active + history) and in-app notifications | ✅ | FR-2.6 |
| C17 | Email when position ≤ 3 | ✅ | FR-2.4 |
| C18 | Guest join via QR poster at the venue (name only, device cookie) | ✅ | — |
| C19 | Browser push notifications | 🔜 | — |
| C20 | Book a time slot (reservations + walk-ins together) | 🔜 | — |
| C21 | SMS / WhatsApp alerts, Hindi/Marathi UI | 🔜 | Future |

### 5.2 Business
| ID | Feature | | SRS ref |
|---|---|---|---|
| B1 | Onboarding wizard: details → map pin → amenities & hours → logo + KYC upload → "Pending approval" | ✅ | FR-3.1 |
| B2 | Services: add, edit, delete, with search tags | ✅ | FR-3.2 |
| B3 | Queues: name, token prefix (A–Z), daily capacity, grace period, express flag, prerequisite checklist builder | ✅ | FR-3.3 |
| B4 | Open / Pause / Close a queue | ✅ | FR-4.1 |
| B5 | Counters, with the queues each counter serves | ✅ | FR-3.4 |
| B6 | Staff invite with Manager / Staff roles | ✅ | NFR 5.2 |
| B7 | **Counter console**: Call Next → Start → Complete / Skip / No-show / Recall, keyboard shortcuts, note tags, live waiting list | ✅ | FR-4.2–4.4 |
| B8 | Broadcast message to the whole queue or a token range | ✅ | — |
| B9 | Printable **QR poster** per queue (for guest join) | ✅ | — |
| B10 | Kiosk device setup (key shown once) | ✅ | — |
| B11 | Analytics: served today, avg wait, avg service time, no-show %, per-counter count, busy-hours heatmap | ✅ basic | FR-6.1, 6.2 |
| B12 | Reservation slot settings | 🔜 | — |

### 5.3 Kiosk & TV (React routes, full-screen mode)
| ID | Feature | |
|---|---|---|
| K1 | `/kiosk`: big buttons → pick service → document reminder → print ticket with token + QR to track on phone | ✅ |
| K2 | `/display/:slug`: TV board with now serving per counter, next 5 tokens, broadcast ticker, chime on call | ✅ |

### 5.4 Admin (`/admin`)
| ID | Feature | |
|---|---|---|
| A1 | Approve / reject (with reason) / suspend businesses; view KYC | ✅ |
| A2 | Manage categories and need keywords (powers C4) | ✅ |
| A3 | Block / unblock users | ✅ |
| A4 | Platform stats: tokens per day, top businesses; CSV export | ✅ basic |

---

## 6. How the queue works (core logic)

### 6.1 Token lifecycle
```
WAITING ──call──► CALLED ──start──► SERVING ──complete──► COMPLETED
   │                │  ├─ recall (stays CALLED, timer restarts)
   │                │  ├─ skip ──────────► SKIPPED
   │                │  └─ grace over ────► NO_SHOW   (auto, by background job)
   └── customer leaves ──► CANCELLED
```
Only these moves are allowed. Any other move is rejected with **409 STATE_CONFLICT**.

### 6.2 Joining (inside Postgres function `join_queue`, one transaction)
1. Queue must be OPEN, the business APPROVED, and today's count under `daily_capacity`.
2. Every **required** prerequisite id must be in `prereq_ack`.
3. Lock the user's profile row, then count their active tokens in the same category. If already 2 → **429 TOKEN_LIMIT_REACHED**. For guests, apply the same rule per `device_id`.
4. Get the next number atomically:
   ```sql
   insert into queue_day_seq(queue_id, service_date, last_seq) values ($1, $2, 1)
   on conflict (queue_id, service_date) do update set last_seq = queue_day_seq.last_seq + 1
   returning last_seq;
   ```
   This single statement is safe even with 200 people joining at the same second: no duplicates and no gaps.
5. Token code = prefix + 3 digits (`A-042`). Numbers restart every day (India time).
6. Insert the entry, log a `JOINED` event, and refresh `queue_live`.

### 6.3 Call next (multi-counter safe)
```sql
select id from queue_entries
where queue_id = any($counter_queue_ids) and service_date = $today and status = 'WAITING'
order by seq
limit 1
for update skip locked;
```
Two counters pressing Call Next at the same moment get **different** people.

### 6.4 Position & ETA (calculated, not stored)
- A table **`queue_live`** keeps **one row per queue**: now serving, the ordered list of waiting token codes, waiting count, active counters, average service time, crowd colour and a version number.
- Every change calls `refresh_queue_live(queue_id)`, which rewrites that one row.
- Customers subscribe to that row with Realtime. Each phone finds its own token in the list, so **position = index + 1**.
- **ETA** = `ceil(position ÷ active counters) × avg service time`.
- **Avg service time** uses a moving average (EWMA), updated on every completion: `new = 0.3 × this service + 0.7 × old`. It starts from the service's default time.
- Why this is good: when someone cancels, it's **one row update and one realtime message**, and everyone's position updates. Nobody rewrites 50 rows.
- Privacy: `queue_live` holds **token codes only**, never names.

### 6.5 Crowd colour
🟢 GREEN: 0–3 waiting · 🟡 YELLOW: 4–9 · 🔴 RED: 10+ (one shared constant in DB and frontend).

### 6.6 Auto no-show
A Node cron job runs every 15 seconds and calls `expire_called_entries()`. Any token that stayed CALLED longer than the queue's `grace_sec` (default 300) becomes NO_SHOW, the counter is freed, and `queue_live` refreshes.

### 6.7 End of day
At 23:59 IST, a job closes open queues and cancels leftover WAITING tokens.

### 6.8 "Turn is near" alert
After every refresh, Node finds tokens whose position is now ≤ 3 and haven't been alerted yet (`alerted_near = false`). It inserts a `notifications` row (shown in-app via Realtime) and sends an email.

### 6.9 Reconnect safety
If a phone loses internet, on reconnect the app **refetches `queue_live`** and compares `version`, so it never shows stale data (NFR 5.3).

---

## 7. Database (Supabase Postgres)

Enable extensions: `postgis`, `pg_trgm`, `pgcrypto`. All times are `timestamptz`, and "today" is computed as `(now() at time zone 'Asia/Kolkata')::date`.

| Table | Main columns |
|---|---|
| `profiles` | id (= auth.users.id), full_name, phone, role (`customer`/`business`/`admin`), is_blocked, created_at |
| `categories` | id, slug, name, icon, sort_order |
| `need_keywords` | id, keyword, category_id, service_tag (e.g. "ear pain" → "ENT") |
| `pincodes` | pincode, area, lat, lng (seed Pune 411001–411062) |
| `businesses` | id, owner_id, slug, name, category_id, description, address, city, pincode, `location geography(Point,4326)`, amenities jsonb `{wheelchair, parking}`, opening_hours jsonb, logo_path, kyc_path, status (`pending`/`approved`/`rejected`/`suspended`), reject_reason |
| `business_members` | business_id, user_id, role (`manager`/`staff`) |
| `services` | id, business_id, name, tags text[], default_service_sec |
| `queues` | id, business_id, service_id, name, token_prefix, status (`open`/`paused`/`closed`), daily_capacity, grace_sec, is_express, prerequisites jsonb `[{id,label,required}]`, ewma_service_sec |
| `counters` | id, business_id, name, is_active, current_entry_id |
| `counter_queues` | counter_id, queue_id |
| `queue_day_seq` | queue_id, service_date, last_seq (PK: queue_id + service_date) |
| `queue_entries` | id, queue_id, business_id, user_id (null for guest/kiosk), guest_name, device_id, source (`app`/`qr`/`kiosk`), service_date, seq, token_code, status, counter_id, notes jsonb, prereq_ack jsonb, claim_code, alerted_near, joined_at, called_at, serving_at, finished_at. Unique (queue_id, service_date, seq). |
| `queue_live` | queue_id (PK), status, now_serving jsonb `[{counter, token}]`, waiting text[], waiting_count, active_counters, ewma_service_sec, traffic, version, updated_at |
| `broadcasts` | id, queue_id, sender_id, message, from_seq, to_seq, created_at |
| `queue_events` | id, queue_id, entry_id, type, actor_id, payload jsonb, created_at. **Append-only**, used for analytics. |
| `notifications` | id, user_id, title, body, entry_id, read_at, created_at |
| `kiosk_devices` | id, business_id, name, key_hash, revoked_at |

### Postgres functions (`security definer`, EXECUTE granted to `service_role` only)
- `join_queue(...)`
- `call_next(counter_id, actor)`
- `transition_entry(entry_id, from, to, actor)`
- `refresh_queue_live(queue_id)`
- `expire_called_entries()`
- `close_day()`

Public read function (anon allowed): `search_businesses(lat, lng, radius_m, category, q, wheelchair, parking, express, open_now)`. It returns businesses with distance, `matched_because` and their queues' `queue_live` data.

### RLS summary
| Table | Who can read | Who can write |
|---|---|---|
| businesses, services, queues, counters | Everyone (approved businesses only); members see their own even when pending | Node only |
| queue_live, broadcasts | Everyone | Node only |
| queue_entries | Owner (`user_id = auth.uid()`) or members of that business | Node only |
| notifications | Owner | Node (insert); owner can mark read |
| profiles | Self; members can see names of customers in their business queues | Self (name/phone only) |
| queue_events, kiosk_devices, queue_day_seq | Nobody from the client | Node only |

Realtime publication: `queue_live`, `queue_entries`, `broadcasts`, `notifications`.

Storage buckets: `logos` (public), `kyc` (private; readable only through a Node-generated signed URL for admins and owners).

---

## 8. Auth, cookies & security

- **Supabase Auth** handles signup, login, Google OAuth and email verification. The supabase-js client keeps the session and auto-refreshes the token.
- React sends `Authorization: Bearer <access_token>` to Node.
- Node verifies the token with Supabase, loads the profile, and blocks users where `is_blocked = true`.
- Role checks in Node middleware: `requireAuth`, `requireRole('admin')`, `requireMember(businessId, 'manager' | 'staff')`.
- Node uses the **service role key** (server-side only, never in the frontend).

**Cookies used:**

| Cookie | Purpose |
|---|---|
| `ql_loc` | Remembers the last location/pincode (30 days) |
| `ql_theme` | Light/dark mode |
| `ql_device` | Random id for **guest QR joins** (1 year). Enforces the 2-token limit for people without accounts. |
| `ql_kiosk` | Marks a tablet as a kiosk for a business (set after entering the kiosk key; Node validates it on every kiosk request) |

**Other security:**
- Rate limiting on join/login/QR endpoints (`express-rate-limit`).
- `helmet` headers, CORS limited to the frontend URL, Zod validation on every request body.
- Public views never show customer names.

---

## 9. Node API (Express + TypeScript)

Base: `/api`. Errors are JSON `{ code, message }` with codes like `QUEUE_CLOSED`, `TOKEN_LIMIT_REACHED`, `STATE_CONFLICT`, `COUNTER_BUSY`, `PREREQ_MISSING`, `FORBIDDEN`.

**Customer**
- `POST /queues/:id/join` `{ prereqAck, notes }`
- `DELETE /entries/:id` (leave)
- `GET /queues/:id/alternatives` (smart distribution)

**Guest QR**
- `POST /qr/queues/:id/join` `{ name, prereqAck, notes }`, using the `ql_device` cookie. Returns `{ entryId, claimCode }`.
- `GET /entries/:id?claim=CODE` (read-only tracker for guests and kiosk tickets)

**Business (manager unless noted)**
- `POST /businesses`, `PATCH /businesses/:id`
- `POST /uploads/sign` (signed upload URL for logo/KYC)
- CRUD: `/businesses/:id/services`, `/queues`, `/counters`, `/members`
- `PUT /counters/:id/queues`
- `PATCH /queues/:id/status` (staff)
- `POST /counters/:id/call-next` (staff)
- `POST /entries/:id/start | complete | skip | no-show | recall` (staff)
- `POST /queues/:id/broadcasts` (staff)
- `POST /businesses/:id/kiosks`, `DELETE /kiosks/:id`
- `GET /businesses/:id/analytics?from&to`

**Kiosk** (`ql_kiosk` cookie or `X-Kiosk-Key` header)
- `POST /kiosk/setup`
- `GET /kiosk/queues`
- `POST /kiosk/queues/:id/join`

**Admin**
- `GET /admin/businesses?status=`
- `POST /admin/businesses/:id/approve | reject | suspend`
- `GET /admin/businesses/:id/kyc-url`
- CRUD `/admin/categories`, `/admin/keywords`
- `POST /admin/users/:id/block | unblock`
- `GET /admin/stats`, `GET /admin/stats.csv`

**Jobs**
- Every 15 s: `expire_called_entries`
- 23:59 IST: `close_day`
- After every change: turn-near alerts

---

## 10. Frontend pages (React Router)

| Route | Page |
|---|---|
| `/` | Landing: hero, how it works, category grid, pincode box |
| `/discover` | Search results + filters + map; each card shows a crowd badge |
| `/b/:slug` | Business page with queues (live badges), services, hours, map |
| `/q/:queueId/join` | Gatekeeper checklist → notes → Join; alternatives if 🔴 |
| `/join/:queueId` | Guest QR join (name + checklist) |
| `/t/:entryId` | **Live tracker** (also `?claim=` for guests/kiosk) |
| `/me/tokens`, `/me/notifications` | My tokens, inbox |
| `/login`, `/register` | Auth |
| `/biz/onboard` | Onboarding wizard |
| `/biz/:id` | Overview |
| `/biz/:id/queues`, `/services`, `/counters`, `/staff`, `/kiosks` | Setup pages (queue page includes the prerequisite builder + QR poster print) |
| `/biz/:id/console` | **Counter console** |
| `/biz/:id/analytics` | Charts (Recharts) |
| `/kiosk` | Kiosk flow (full screen, big buttons, print ticket) |
| `/display/:slug` | TV board (dark, huge text) |
| `/admin/*` | Admin panel |

**Design:** calm and trustworthy (teal/indigo), mobile-first, big token numbers, light/dark mode. Crowd colours always come with text labels, not colour alone.

---

## 11. Folder structure

```
queless/
├── CLAUDE.md
├── docs/QUELESS.md            ← this file
├── web/                       ← React + Vite + TS
│   └── src/{pages,components,features,hooks,lib,store}
├── server/                    ← Node + Express + TS
│   └── src/{routes,middleware,services,jobs,lib}
└── supabase/
    ├── migrations/            ← SQL (tables, RLS, functions)
    └── seed.sql               ← categories, keywords, pincodes, demo Pune businesses
```

**Env vars**
- web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
- server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `RESEND_API_KEY`, `PORT`

---

## 12. Build process (order)

| Step | What | Done when |
|---|---|---|
| 1 | Setup: repo, Supabase project, web + server skeletons | Both run locally; server `/health` OK |
| 2 | Database: migrations, RLS, functions, seed data | Seeded Pune businesses visible; function tests pass |
| 3 | Auth: login/register in React, Node auth middleware | Logged-in user hits a protected Node route |
| 4 | Business setup: onboarding + services/queues/counters/staff | Manager creates a full queue setup |
| 5 | Discovery: search, filters, business page, crowd badges | "ear pain" near 411038 finds the ENT clinic |
| 6 | Queue engine APIs: join, leave, call next, transitions, jobs | 200 parallel joins give tokens 1–200 with no duplicates |
| 7 | Live tracker + my tokens | Phone updates within 1 s when staff calls |
| 8 | Counter console + broadcasts | Two counters on one queue, no double calls |
| 9 | QR guest join + kiosk + TV display | Kiosk prints a ticket; TV flips live |
| 10 | Admin panel | Pending business hidden until approved |
| 11 | Notifications + analytics | Email at position ≤3; charts show today's data |
| 12 | Polish, tests, deploy, demo seed | Live URL; demo script (§14) runs cleanly |

---

## 13. Claude Code prompts (paste one per session, in order)

**How to use:**
1. Create the repo and put this file at `docs/QUELESS.md`.
2. Start `claude` in the repo root.
3. For big steps (P1, P5, P6, P8), press Shift+Tab for Plan Mode first and check the plan it proposes.
4. After each step, test the "Done when" check, `git commit`, then `/clear`.

**P0 — CLAUDE.md**
```
Read docs/QUELESS.md fully. Create CLAUDE.md at the repo root summarising: stack, folder structure, the rule "reads direct to Supabase, writes via Node", the token lifecycle, error codes, env vars, commands, and coding conventions (TypeScript strict, no `any`, Zod validation, small commits). Keep it under 80 lines.
```

**P1 — Setup**
```
Following docs/QUELESS.md §2 and §11: create web/ (Vite React TS, Tailwind, shadcn/ui, React Router, TanStack Query, Zustand, React Hook Form, Zod, supabase-js, Leaflet, Recharts) and server/ (Express TS, supabase-js, zod, helmet, cors, express-rate-limit, node-cron, pino, tsx for dev). Add supabase/ with the Supabase CLI config. Add .env.example files, a root README with setup steps, and npm scripts. Server GET /health. Web home page that pings /health.
```

**P2 — Database**
```
Implement docs/QUELESS.md §6 and §7 as SQL migrations in supabase/migrations: extensions, all tables with constraints and indexes (GIST on businesses.location, trigram on need_keywords.keyword), RLS policies exactly as the table in §7, realtime publication, storage buckets, and the Postgres functions join_queue, call_next, transition_entry, refresh_queue_live, expire_called_entries, close_day, search_businesses. Put all queue logic inside these functions exactly as §6 describes (atomic seq upsert, FOR UPDATE SKIP LOCKED, allowed transitions, EWMA, traffic thresholds, IST service_date). Write seed.sql: 6 categories, ~40 need keywords, Pune pincodes, 12 approved demo businesses across Pune areas with services, queues (with prerequisites) and counters, plus demo users (customer, manager, staff, admin). Add SQL tests (or a Node script) proving: 200 concurrent joins → seq 1..200 unique; concurrent call_next never picks the same entry; illegal transitions raise errors.
```

**P3 — Auth**
```
Implement §8: Supabase Auth in web (register, login, Google, email verify, protected routes by role, profile creation trigger in DB). In server: requireAuth middleware verifying the Bearer token with Supabase, loading the profile, blocking is_blocked users; requireRole and requireMember(businessId, role) helpers. Add the ql_loc and ql_theme cookies in web. Error format per §9.
```

**P4 — Business setup**
```
Implement §5.2 B1–B6, B9–B10 and the matching §9 business endpoints. Node validates with Zod and writes with the service role. Web pages /biz/onboard (wizard with map pin, hours editor, logo + KYC upload via signed URLs), /biz/:id/services, /queues (with prerequisite checklist builder and printable QR poster linking to /join/:queueId), /counters, /staff, /kiosks (show key once). New businesses start as pending.
```

**P5 — Discovery**
```
Implement §5.1 C2–C8: /discover using search_businesses (GPS or pincode, radius chips 2/5/10, category, need search with "matched because" chips, filters, results list + Leaflet map), crowd badges subscribed to queue_live via Realtime, /b/:slug business page, GET /queues/:id/alternatives in Node for smart distribution.
```

**P6 — Queue engine + live tracker**
```
Implement §6 and §9 customer + staff queue endpoints in Node (join, leave, call-next, start, complete, skip, no-show, recall, queue status, broadcasts) calling the Postgres functions, plus jobs: expire every 15 s, close_day at 23:59 IST, and turn-near alerts (notifications row + email). In web: /q/:queueId/join (gatekeeper: Join disabled until all required boxes ticked; notes step; 🔴 → alternatives), /t/:entryId live tracker (big token, position from queue_live.waiting, ETA countdown, now serving, broadcasts, paused banner, leave button, full-screen "Go to Counter X" on CALLED with sound + vibration + grace countdown, reconnect resync by version), /me/tokens, /me/notifications.
```

**P7 — Counter console**
```
Implement /biz/:id/console per §5.2 B7–B8: choose counter, big CALL NEXT, then Start / Complete / Skip / No-show / Recall with keyboard shortcuts (N, S, C, K, X, R), current token card with note tags, grace timer, live waiting list via Realtime on queue_entries, broadcast composer with optional token range, optimistic UI with rollback on 409.
```

**P8 — Guest QR, kiosk, TV**
```
Implement §5.3 and C18: /join/:queueId guest flow with ql_device cookie; /kiosk (setup with key → ql_kiosk cookie; big-button service picker → document reminder → ticket page with token, people ahead, ETA and QR to /t/:id?claim=CODE, print CSS for 80mm paper, auto-reset after 20 s); /display/:slug TV board (now serving per counter, next 5, broadcast ticker, clock, chime on new call) using Realtime.
```

**P9 — Admin**
```
Implement §5.4 at /admin (admin role only): business approval list with tabs by status, detail with KYC signed URL, approve/reject(reason)/suspend + email to owner; categories & keywords CRUD with a "test search" box; block/unblock users; stats page (tokens per day, top businesses, no-show rate from queue_events) with CSV export.
```

**P10 — Analytics**
```
Implement GET /businesses/:id/analytics (from queue_events: served, avg wait, avg service, no-show %, per counter, weekday×hour heatmap) and /biz/:id/analytics with Recharts + date range. Add the overview cards on /biz/:id.
```

**P11 — Polish & deploy**
```
Polish: loading skeletons, empty states, error toasts, accessibility (aria-live on the tracker position), mobile check on every page, Lighthouse ≥ 90 on /t/:id. Tests for gatekeeper, tracker position logic, and the Node routes. Deploy web to Vercel, server to Render, and document the steps in the README. Add a script that resets the demo data to the §14 scenario.
```

**Fix prompt (anytime)**
```
Bug: <what I did> → <what happened> → <what I expected>. Error: <paste>. Find the root cause, fix it, add a test, and keep docs/QUELESS.md rules.
```

---

## 14. Demo script (5–7 min)

1. Admin approves "Sahyadri ENT Clinic, Kothrud" → it appears in search.
2. Customer: pincode 411038, types "ear pain" → ENT queue is 🔴 → app suggests a 🟢 clinic 2 km away.
3. Customer ticks the documents, adds "wheelchair", joins → **E-014**.
4. A walk-in uses the kiosk tablet → ticket **E-015** with QR. A guest scans the door QR poster → **E-016**.
5. Staff clicks **Call Next** → the ♿ tag shows; the TV board and phones update instantly.
6. Someone ahead leaves → everyone's position and ETA drop live.
7. Staff broadcasts "Doctor delayed 10 min" → it appears on phones and the TV.
8. A called person doesn't come → after the grace period, auto no-show → next person called.
9. Analytics shows today's served count, avg wait and busy hours.

---

## 15. Out of scope for now (future work)
SMS/WhatsApp alerts · native mobile apps · AI wait-time prediction (compare against the EWMA baseline — good paper angle) · multi-branch chains · payments · Hindi/Marathi UI · reservations (C20, designed as v2).
