-- =====================================================================
-- QueLess · 0001 · Schema (extensions, helpers, tables, indexes)
-- =====================================================================
create schema if not exists extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- Small helpers used everywhere
-- ---------------------------------------------------------------------

-- "Today" is always India time, so token numbers restart at IST midnight.
create or replace function public.app_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- Crowd colour. Shared thresholds: 0-3 GREEN, 4-9 YELLOW, 10+ RED.
-- (The same constants live in web/src/lib/traffic.ts.)
create or replace function public.traffic_for(n int) returns text
language sql immutable as $$
  select case when n <= 3 then 'GREEN' when n <= 9 then 'YELLOW' else 'RED' end
$$;

-- Raise a business-rule error that the Node API turns into { code, message }.
create or replace function public.raise_app(p_code text, p_msg text) returns void
language plpgsql as $$
begin
  raise exception using message = p_code, detail = p_msg, hint = 'queless', errcode = 'P0001';
end $$;

-- opening_hours format: {"mon":["09:00","18:00"], "sun": null, ...}
-- Empty object = always open.
create or replace function public.is_open_now(h jsonb) returns boolean
language sql stable as $$
  select case
    when h is null or h = '{}'::jsonb then true
    else coalesce((
      select (now() at time zone 'Asia/Kolkata')::time between (d->>0)::time and (d->>1)::time
      from (select h -> lower(to_char(now() at time zone 'Asia/Kolkata', 'Dy')) as d) x
      where jsonb_typeof(d) = 'array'
    ), false)
  end
$$;

-- (lat, lng) → geography point. Lets the API avoid calling PostGIS directly.
create or replace function public.make_point(p_lat double precision, p_lng double precision) returns geography
language sql immutable set search_path = public, extensions as $$
  select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
-- Our own user accounts (session auth, bcrypt password hashes).
create table public.users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  password_hash  text not null,
  full_name      text not null default '',
  phone          text,
  role           text not null default 'customer' check (role in ('customer','business','admin')),
  is_blocked     boolean not null default false,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
create unique index users_email_key on public.users (lower(email));

-- Server-side sessions (connect-pg-simple). The browser only holds a random id cookie.
create table public.user_sessions (
  sid     varchar primary key,
  sess    json not null,
  expire  timestamp(6) not null
);
create index user_sessions_expire_idx on public.user_sessions (expire);

-- Uploaded files (logos are public, KYC documents private). Kept in Postgres so
-- the app runs on any host without extra storage services. Max 2 MB each.
create table public.files (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.users(id) on delete set null,
  kind        text not null check (kind in ('logo','kyc')),
  mime        text not null,
  size_bytes  int  not null check (size_bytes <= 2097152),
  data        bytea not null,
  created_at  timestamptz not null default now()
);

create table public.categories (
  id          serial primary key,
  slug        text not null unique,
  name        text not null,
  icon        text not null default '📍',
  sort_order  int  not null default 0
);

create table public.need_keywords (
  id           serial primary key,
  keyword      text not null,
  category_id  int  not null references public.categories(id) on delete cascade,
  service_tag  text not null,
  unique (keyword, service_tag)
);
create index need_keywords_trgm on public.need_keywords using gin (keyword gin_trgm_ops);

create table public.pincodes (
  pincode  text primary key,
  area     text not null,
  lat      double precision not null,
  lng      double precision not null
);

create table public.businesses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references public.users(id) on delete set null,
  slug           text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name           text not null,
  category_id    int  not null references public.categories(id),
  description    text not null default '',
  address        text not null default '',
  city           text not null default 'Pune',
  pincode        text,
  phone          text,
  location       geography(Point, 4326) not null,
  -- plain numbers for the web app (geography is not JSON friendly)
  lat            double precision generated always as (st_y(location::geometry)) stored,
  lng            double precision generated always as (st_x(location::geometry)) stored,
  amenities      jsonb not null default '{}'::jsonb,   -- {wheelchair, parking}
  opening_hours  jsonb not null default '{}'::jsonb,
  logo_file_id   uuid references public.files(id) on delete set null,
  kyc_file_id    uuid references public.files(id) on delete set null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  reject_reason  text,
  created_at     timestamptz not null default now()
);
create index businesses_location_gist on public.businesses using gist (location);
create index businesses_status_idx on public.businesses (status);
create index businesses_owner_idx on public.businesses (owner_id);

create table public.business_members (
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null check (role in ('manager','staff')),
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.services (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  name                 text not null,
  tags                 text[] not null default '{}',
  default_service_sec  int  not null default 300 check (default_service_sec between 30 and 7200),
  created_at           timestamptz not null default now()
);
create index services_business_idx on public.services (business_id);

create table public.queues (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  service_id        uuid references public.services(id) on delete set null,
  name              text not null,
  token_prefix      text not null check (token_prefix ~ '^[A-Z]$'),
  status            text not null default 'closed' check (status in ('open','paused','closed')),
  daily_capacity    int  not null default 200 check (daily_capacity between 1 and 5000),
  grace_sec         int  not null default 300 check (grace_sec between 30 and 3600),
  is_express        boolean not null default false,
  prerequisites     jsonb not null default '[]'::jsonb,  -- [{id,label,required}]
  ewma_service_sec  numeric,
  created_at        timestamptz not null default now()
);
create index queues_business_idx on public.queues (business_id);

create table public.counters (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  name              text not null,
  is_active         boolean not null default true,
  current_entry_id  uuid,
  created_at        timestamptz not null default now()
);
create index counters_business_idx on public.counters (business_id);

create table public.counter_queues (
  counter_id  uuid not null references public.counters(id) on delete cascade,
  queue_id    uuid not null references public.queues(id) on delete cascade,
  primary key (counter_id, queue_id)
);
create index counter_queues_queue_idx on public.counter_queues (queue_id);

-- One row per queue per day. The atomic upsert on this row hands out token numbers.
create table public.queue_day_seq (
  queue_id      uuid not null references public.queues(id) on delete cascade,
  service_date  date not null,
  last_seq      int  not null,
  primary key (queue_id, service_date)
);

create table public.queue_entries (
  id            uuid primary key default gen_random_uuid(),
  queue_id      uuid not null references public.queues(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  guest_name    text,
  device_id     text,
  source        text not null default 'app' check (source in ('app','qr','kiosk')),
  service_date  date not null default public.app_today(),
  seq           int  not null,
  token_code    text not null,
  status        text not null default 'WAITING'
                check (status in ('WAITING','CALLED','SERVING','COMPLETED','SKIPPED','NO_SHOW','CANCELLED')),
  counter_id    uuid references public.counters(id) on delete set null,
  notes         jsonb not null default '{}'::jsonb,  -- {party_size, accessibility[], text}
  prereq_ack    jsonb not null default '[]'::jsonb,  -- ["id_proof", ...]
  claim_code    text not null,
  alerted_near  boolean not null default false,
  joined_at     timestamptz not null default now(),
  called_at     timestamptz,
  serving_at    timestamptz,
  finished_at   timestamptz,
  unique (queue_id, service_date, seq)
);
create index queue_entries_live_idx   on public.queue_entries (queue_id, service_date, status, seq);
create index queue_entries_user_idx   on public.queue_entries (user_id, status);
create index queue_entries_device_idx on public.queue_entries (device_id, status) where device_id is not null;
create index queue_entries_biz_idx    on public.queue_entries (business_id, service_date);

alter table public.counters
  add constraint counters_current_entry_fk
  foreign key (current_entry_id) references public.queue_entries(id) on delete set null;

-- The single "live" row per queue that every phone / TV subscribes to.
-- Holds token codes only, never names (privacy).
create table public.queue_live (
  queue_id          uuid primary key references public.queues(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  status            text not null,
  now_serving       jsonb not null default '[]'::jsonb,  -- [{counter, counter_id, token, status, called_at}]
  waiting           text[] not null default '{}',        -- ordered token codes
  waiting_count     int not null default 0,
  active_counters   int not null default 1,
  ewma_service_sec  int not null default 300,
  traffic           text not null default 'GREEN',
  version           bigint not null default 1,
  updated_at        timestamptz not null default now()
);
create index queue_live_business_idx on public.queue_live (business_id);

create table public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  queue_id    uuid not null references public.queues(id) on delete cascade,
  sender_id   uuid references public.users(id) on delete set null,
  message     text not null check (char_length(message) between 1 and 280),
  from_seq    int,
  to_seq      int,
  created_at  timestamptz not null default now()
);
create index broadcasts_queue_idx on public.broadcasts (queue_id, created_at desc);

-- Append-only event log (analytics + audit).
create table public.queue_events (
  id          bigserial primary key,
  queue_id    uuid not null references public.queues(id) on delete cascade,
  entry_id    uuid references public.queue_entries(id) on delete cascade,
  type        text not null,
  actor_id    uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index queue_events_queue_idx on public.queue_events (queue_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  entry_id    uuid references public.queue_entries(id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
