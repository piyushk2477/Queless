-- =====================================================================
-- QueLess · 0002 · Queue engine (all queue rules live here, atomically)
-- Only the Node API calls these (the browser never talks to the database).
-- Each call is one transaction, so concurrent requests can't corrupt a queue.
-- =====================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- refresh_queue_live: rebuild the ONE public row for a queue.
-- Phones compute their own position from `waiting` (index + 1).
-- ---------------------------------------------------------------------
create or replace function public.refresh_queue_live(p_queue_id uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  v_q        public.queues%rowtype;
  v_today    date := public.app_today();
  v_now      jsonb;
  v_wait     text[];
  v_counters int;
  v_ewma     int;
begin
  select * into v_q from public.queues where id = p_queue_id;
  if not found then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'counter', c.name, 'counter_id', c.id, 'token', e.token_code,
           'status', e.status, 'called_at', e.called_at) order by e.called_at desc), '[]'::jsonb)
    into v_now
    from public.queue_entries e
    left join public.counters c on c.id = e.counter_id
   where e.queue_id = p_queue_id and e.service_date = v_today
     and e.status in ('CALLED','SERVING');

  select coalesce(array_agg(e.token_code order by e.seq), '{}')
    into v_wait
    from public.queue_entries e
   where e.queue_id = p_queue_id and e.service_date = v_today and e.status = 'WAITING';

  select greatest(count(*), 1)::int into v_counters
    from public.counters c
    join public.counter_queues cq on cq.counter_id = c.id
   where cq.queue_id = p_queue_id and c.is_active;

  select round(coalesce(v_q.ewma_service_sec, s.default_service_sec, 300))::int into v_ewma
    from (select 1) x left join public.services s on s.id = v_q.service_id;

  insert into public.queue_live as ql
    (queue_id, business_id, status, now_serving, waiting, waiting_count,
     active_counters, ewma_service_sec, traffic, version, updated_at)
  values
    (p_queue_id, v_q.business_id, v_q.status, v_now, v_wait, cardinality(v_wait),
     v_counters, v_ewma, public.traffic_for(cardinality(v_wait)), 1, now())
  on conflict (queue_id) do update set
     status           = excluded.status,
     now_serving      = excluded.now_serving,
     waiting          = excluded.waiting,
     waiting_count    = excluded.waiting_count,
     active_counters  = excluded.active_counters,
     ewma_service_sec = excluded.ewma_service_sec,
     traffic          = excluded.traffic,
     version          = ql.version + 1,
     updated_at       = now();

  -- Tell every Node instance (LISTEN queue_live) to push the new row to browsers.
  -- Delivered only when the transaction commits.
  perform pg_notify('queue_live', json_build_object('queue_id', p_queue_id, 'business_id', v_q.business_id)::text);
end $$;

-- Keep queue_live in sync when setup changes (new queue, status, counters).
create or replace function public.tg_refresh_from_queue() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.refresh_queue_live(new.id);
  return null;
end $$;
create trigger queues_refresh_live
  after insert or update of status, service_id on public.queues
  for each row execute function public.tg_refresh_from_queue();

create or replace function public.tg_refresh_from_counter_queues() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.refresh_queue_live(coalesce(new.queue_id, old.queue_id));
  return null;
end $$;
create trigger counter_queues_refresh_live
  after insert or delete on public.counter_queues
  for each row execute function public.tg_refresh_from_counter_queues();

create or replace function public.tg_refresh_from_counter() returns trigger
language plpgsql set search_path = public as $$
declare r record;
begin
  for r in select queue_id from public.counter_queues where counter_id = new.id loop
    perform public.refresh_queue_live(r.queue_id);
  end loop;
  return null;
end $$;
create trigger counters_refresh_live
  after update of is_active, name on public.counters
  for each row execute function public.tg_refresh_from_counter();

-- ---------------------------------------------------------------------
-- join_queue: one transaction, no duplicate or missing token numbers.
-- ---------------------------------------------------------------------
create or replace function public.join_queue(
  p_queue_id    uuid,
  p_user_id     uuid  default null,
  p_guest_name  text  default null,
  p_device_id   text  default null,
  p_source      text  default 'app',
  p_prereq_ack  jsonb default '[]'::jsonb,
  p_notes       jsonb default '{}'::jsonb
) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_q      public.queues%rowtype;
  v_b      public.businesses%rowtype;
  v_today  date := public.app_today();
  v_pre    jsonb;
  v_active int;
  v_seq    int;
  v_token  text;
  v_entry  public.queue_entries%rowtype;
  v_pos    int;
begin
  -- 1. queue open + business approved
  select * into v_q from public.queues where id = p_queue_id;
  if not found then perform public.raise_app('NOT_FOUND', 'Queue not found'); end if;
  select * into v_b from public.businesses where id = v_q.business_id;
  if v_b.status <> 'approved' then
    perform public.raise_app('BUSINESS_NOT_APPROVED', 'This business is not accepting tokens right now');
  end if;
  if v_q.status = 'paused' then
    perform public.raise_app('QUEUE_PAUSED', 'This queue is paused. Please try again in a few minutes');
  elsif v_q.status <> 'open' then
    perform public.raise_app('QUEUE_CLOSED', 'This queue is closed right now');
  end if;

  -- 2. prerequisite gatekeeper
  for v_pre in select value from jsonb_array_elements(v_q.prerequisites) loop
    if coalesce((v_pre->>'required')::boolean, false)
       and not (coalesce(p_prereq_ack, '[]'::jsonb) ? (v_pre->>'id')) then
      perform public.raise_app('PREREQ_MISSING', 'Please confirm: ' || (v_pre->>'label'));
    end if;
  end loop;

  -- 3. anti-spam: max 2 active tokens per category (per user, or per guest device)
  if p_user_id is not null then
    perform 1 from public.users where id = p_user_id for update;   -- serialises this user's joins
    if exists (select 1 from public.users where id = p_user_id and is_blocked) then
      perform public.raise_app('FORBIDDEN', 'Your account is blocked');
    end if;
    if exists (select 1 from public.queue_entries
                where queue_id = p_queue_id and user_id = p_user_id and service_date = v_today
                  and status in ('WAITING','CALLED','SERVING')) then
      perform public.raise_app('ALREADY_IN_QUEUE', 'You already have a token in this queue');
    end if;
    select count(*) into v_active
      from public.queue_entries e join public.businesses b2 on b2.id = e.business_id
     where e.user_id = p_user_id and e.service_date = v_today
       and e.status in ('WAITING','CALLED','SERVING') and b2.category_id = v_b.category_id;
    if v_active >= 2 then
      perform public.raise_app('TOKEN_LIMIT_REACHED', 'You can hold at most 2 active tokens in this category');
    end if;
  elsif p_device_id is not null and p_source = 'qr' then
    perform pg_advisory_xact_lock(hashtext('ql_device:' || p_device_id));
    if exists (select 1 from public.queue_entries
                where queue_id = p_queue_id and device_id = p_device_id and service_date = v_today
                  and status in ('WAITING','CALLED','SERVING')) then
      perform public.raise_app('ALREADY_IN_QUEUE', 'This device already has a token in this queue');
    end if;
    select count(*) into v_active
      from public.queue_entries e join public.businesses b2 on b2.id = e.business_id
     where e.device_id = p_device_id and e.service_date = v_today
       and e.status in ('WAITING','CALLED','SERVING') and b2.category_id = v_b.category_id;
    if v_active >= 2 then
      perform public.raise_app('TOKEN_LIMIT_REACHED', 'This device can hold at most 2 active tokens in this category');
    end if;
  end if;

  -- 4. next number, atomically (row lock on queue_day_seq serialises same-queue joins)
  insert into public.queue_day_seq as s (queue_id, service_date, last_seq)
  values (p_queue_id, v_today, 1)
  on conflict (queue_id, service_date) do update set last_seq = s.last_seq + 1
  returning last_seq into v_seq;

  if v_seq > v_q.daily_capacity then
    perform public.raise_app('QUEUE_FULL', 'Today''s capacity for this queue is full');
  end if;

  -- 5. token code: prefix + 3 digits (A-042)
  v_token := v_q.token_prefix || '-' ||
             case when v_seq < 1000 then lpad(v_seq::text, 3, '0') else v_seq::text end;

  -- 6. insert + event + refresh
  insert into public.queue_entries
    (queue_id, business_id, user_id, guest_name, device_id, source, service_date,
     seq, token_code, notes, prereq_ack, claim_code, joined_at)
  values
    (p_queue_id, v_b.id, p_user_id, nullif(trim(p_guest_name), ''), p_device_id, p_source, v_today,
     v_seq, v_token, coalesce(p_notes, '{}'::jsonb), coalesce(p_prereq_ack, '[]'::jsonb),
     upper(encode(gen_random_bytes(3), 'hex')), clock_timestamp())
  returning * into v_entry;

  insert into public.queue_events (queue_id, entry_id, type, actor_id, payload)
  values (p_queue_id, v_entry.id, 'JOINED', p_user_id, jsonb_build_object('source', p_source));

  perform public.refresh_queue_live(p_queue_id);

  select count(*) into v_pos from public.queue_entries
   where queue_id = p_queue_id and service_date = v_today and status = 'WAITING' and seq <= v_seq;

  return jsonb_build_object(
    'id', v_entry.id, 'token_code', v_token, 'claim_code', v_entry.claim_code,
    'position', v_pos, 'queue_id', p_queue_id, 'business_id', v_b.id);
end $$;

-- ---------------------------------------------------------------------
-- call_next: FOR UPDATE SKIP LOCKED => two counters never get the same person.
-- Returns null when nobody is waiting.
-- ---------------------------------------------------------------------
create or replace function public.call_next(p_counter_id uuid, p_actor uuid default null) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_c    public.counters%rowtype;
  v_cur  text;
  v_id   uuid;
  v_e    public.queue_entries%rowtype;
begin
  select * into v_c from public.counters where id = p_counter_id for update;
  if not found then perform public.raise_app('NOT_FOUND', 'Counter not found'); end if;
  if not v_c.is_active then perform public.raise_app('COUNTER_INACTIVE', 'This counter is switched off'); end if;

  if v_c.current_entry_id is not null then
    select status into v_cur from public.queue_entries where id = v_c.current_entry_id;
    if v_cur in ('CALLED','SERVING') then
      perform public.raise_app('COUNTER_BUSY', 'Finish or skip the current token first');
    end if;
  end if;

  select e.id into v_id
    from public.queue_entries e
    join public.counter_queues cq on cq.queue_id = e.queue_id and cq.counter_id = p_counter_id
    join public.queues q on q.id = e.queue_id
   where e.service_date = public.app_today() and e.status = 'WAITING' and q.status = 'open'
   order by q.is_express desc, e.joined_at, e.seq
   limit 1
   for update of e skip locked;

  if v_id is null then return null; end if;

  update public.queue_entries
     set status = 'CALLED', called_at = now(), counter_id = p_counter_id
   where id = v_id
  returning * into v_e;

  update public.counters set current_entry_id = v_id where id = p_counter_id;

  insert into public.queue_events (queue_id, entry_id, type, actor_id, payload)
  values (v_e.queue_id, v_id, 'CALLED', p_actor, jsonb_build_object('counter', v_c.name, 'counter_id', v_c.id));

  perform public.refresh_queue_live(v_e.queue_id);
  return to_jsonb(v_e) || jsonb_build_object('counter_name', v_c.name);
end $$;

-- ---------------------------------------------------------------------
-- transition_entry: the ONLY allowed moves (anything else => STATE_CONFLICT)
--   CALLED -> SERVING | CALLED (recall) | SKIPPED | NO_SHOW | CANCELLED
--   SERVING -> COMPLETED
--   WAITING -> CANCELLED
-- ---------------------------------------------------------------------
create or replace function public.transition_entry(
  p_entry_id uuid, p_to text, p_actor uuid default null, p_from text default null
) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_e    public.queue_entries%rowtype;
  v_sec  numeric;
  v_type text := p_to;
begin
  select * into v_e from public.queue_entries where id = p_entry_id for update;
  if not found then perform public.raise_app('NOT_FOUND', 'Token not found'); end if;

  if p_from is not null and v_e.status <> p_from then
    perform public.raise_app('STATE_CONFLICT',
      format('Token %s is %s, expected %s', v_e.token_code, v_e.status, p_from));
  end if;

  if not ((v_e.status, p_to) in (
      ('CALLED','SERVING'), ('CALLED','CALLED'), ('CALLED','SKIPPED'), ('CALLED','NO_SHOW'),
      ('CALLED','CANCELLED'), ('SERVING','COMPLETED'), ('WAITING','CANCELLED'))) then
    perform public.raise_app('STATE_CONFLICT',
      format('Token %s cannot move from %s to %s', v_e.token_code, v_e.status, p_to));
  end if;

  if p_to = 'CALLED' then
    v_type := 'RECALLED';
    update public.queue_entries set called_at = now() where id = p_entry_id returning * into v_e;
  elsif p_to = 'SERVING' then
    update public.queue_entries set status = 'SERVING', serving_at = now() where id = p_entry_id returning * into v_e;
  else
    update public.queue_entries set status = p_to, finished_at = now() where id = p_entry_id returning * into v_e;
    update public.counters set current_entry_id = null where current_entry_id = p_entry_id;

    -- moving average of service time: new = 0.3 * this + 0.7 * old
    if p_to = 'COMPLETED' and v_e.serving_at is not null then
      v_sec := least(greatest(extract(epoch from now() - v_e.serving_at), 20), 3600);
      update public.queues q
         set ewma_service_sec = round(0.3 * v_sec + 0.7 * coalesce(
               q.ewma_service_sec,
               (select s.default_service_sec from public.services s where s.id = q.service_id),
               300))
       where q.id = v_e.queue_id;
    end if;
  end if;

  insert into public.queue_events (queue_id, entry_id, type, actor_id, payload)
  values (v_e.queue_id, p_entry_id, v_type, p_actor, jsonb_build_object('counter_id', v_e.counter_id));

  perform public.refresh_queue_live(v_e.queue_id);
  return to_jsonb(v_e);
end $$;

-- ---------------------------------------------------------------------
-- set_queue_status: open / pause / close
-- ---------------------------------------------------------------------
create or replace function public.set_queue_status(p_queue_id uuid, p_status text, p_actor uuid default null)
returns void
language plpgsql set search_path = public as $$
begin
  if p_status not in ('open','paused','closed') then
    perform public.raise_app('VALIDATION', 'Invalid status');
  end if;
  update public.queues set status = p_status where id = p_queue_id;
  if not found then perform public.raise_app('NOT_FOUND', 'Queue not found'); end if;
  insert into public.queue_events (queue_id, type, actor_id, payload)
  values (p_queue_id, 'STATUS_' || upper(p_status), p_actor, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- expire_called_entries: auto NO_SHOW after the grace period (job, every 15 s)
-- ---------------------------------------------------------------------
create or replace function public.expire_called_entries() returns int
language plpgsql set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select e.id from public.queue_entries e join public.queues q on q.id = e.queue_id
     where e.status = 'CALLED' and e.called_at < now() - make_interval(secs => q.grace_sec)
     for update of e skip locked
  loop
    perform public.transition_entry(r.id, 'NO_SHOW', null, 'CALLED');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- close_day: 23:59 IST — close queues and cancel leftovers
-- ---------------------------------------------------------------------
create or replace function public.close_day() returns int
language plpgsql set search_path = public as $$
declare r record; n int;
begin
  update public.counters set current_entry_id = null where current_entry_id is not null;
  update public.queue_entries set status = 'CANCELLED', finished_at = now()
   where status in ('WAITING','CALLED') and service_date <= public.app_today();
  get diagnostics n = row_count;
  update public.queue_entries set status = 'COMPLETED', finished_at = now()
   where status = 'SERVING' and service_date <= public.app_today();
  update public.queues set status = 'closed' where status <> 'closed';
  for r in select id from public.queues loop
    insert into public.queue_events (queue_id, type, payload) values (r.id, 'DAY_CLOSED', '{}'::jsonb);
    perform public.refresh_queue_live(r.id);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- take_near_alerts: finds WAITING tokens now at position <= 3 that were
-- not alerted yet, flags them, writes in-app notifications, and returns
-- them so Node can send emails.
-- ---------------------------------------------------------------------
create or replace function public.take_near_alerts(p_queue_id uuid default null)
returns table (entry_id uuid, user_id uuid, email text, full_name text,
               token_code text, "position" int, business_name text)
language sql set search_path = public as $$
  with ranked as (
    select e.id, row_number() over (partition by e.queue_id order by e.seq)::int as pos
      from public.queue_entries e
     where e.status = 'WAITING' and e.service_date = public.app_today()
       and (p_queue_id is null or e.queue_id = p_queue_id)
  ),
  due as (
    update public.queue_entries e set alerted_near = true
      from ranked r
     where e.id = r.id and r.pos <= 3 and not e.alerted_near
    returning e.id, e.user_id, e.token_code, r.pos, e.business_id
  ),
  -- data-modifying CTEs always run, even when not referenced below
  notif as (
    insert into public.notifications (user_id, title, body, entry_id)
    select d.user_id, 'Your turn is near',
           format('Token %s is #%s in line. Please head to the venue now.', d.token_code, d.pos), d.id
      from due d where d.user_id is not null
  )
  select d.id, d.user_id, p.email, p.full_name, d.token_code, d.pos, b.name
    from due d
    join public.businesses b on b.id = d.business_id
    left join public.users p on p.id = d.user_id
   where d.user_id is not null;
$$;

-- ---------------------------------------------------------------------
-- search_businesses: public discovery (radius, category, need search, filters)
-- ---------------------------------------------------------------------
create or replace function public.search_businesses(
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_radius_m    int     default 5000,
  p_category    text    default null,
  p_q           text    default null,
  p_wheelchair  boolean default false,
  p_parking     boolean default false,
  p_express     boolean default false,
  p_open_now    boolean default false
) returns table (
  id uuid, slug text, name text, category_slug text, category_name text, category_icon text,
  description text, address text, pincode text, lat double precision, lng double precision,
  distance_m double precision, amenities jsonb, opening_hours jsonb, logo_file_id uuid,
  is_open boolean, matched_because text, queues jsonb
)
language sql stable set search_path = public, extensions as $$
  with params as (
    select nullif(lower(trim(p_q)), '') as q,
           case when p_lat is not null and p_lng is not null
                then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
  ),
  kw as (
    select nk.keyword, nk.service_tag
      from public.need_keywords nk, params
     where params.q is not null
       and (params.q like '%' || lower(nk.keyword) || '%'
            or lower(nk.keyword) like '%' || params.q || '%'
            or similarity(nk.keyword, params.q) > 0.4)
  )
  select b.id, b.slug, b.name, c.slug, c.name, c.icon, b.description, b.address, b.pincode,
         st_y(b.location::geometry), st_x(b.location::geometry),
         case when params.origin is not null then st_distance(b.location, params.origin) end,
         b.amenities, b.opening_hours, b.logo_file_id, public.is_open_now(b.opening_hours),
         coalesce(mk.reason, md.reason),
         coalesce(qs.queues, '[]'::jsonb)
    from public.businesses b
    join public.categories c on c.id = b.category_id
   cross join params
    left join lateral (
      select format('"%s" → %s', kw.keyword, kw.service_tag) as reason
        from kw join public.services s on s.business_id = b.id
       where s.name ~* ('\m' || kw.service_tag || '\M')          -- whole word: "ENT" must not match "Dental"
          or exists (select 1 from unnest(s.tags) t where lower(t) = lower(kw.service_tag))
       limit 1
    ) mk on true
    left join lateral (
      select case
               when lower(b.name) like '%' || params.q || '%' then 'Name matches "' || params.q || '"'
               else (select 'Service: ' || s.name from public.services s
                      where s.business_id = b.id
                        and (lower(s.name) like '%' || params.q || '%'
                             or exists (select 1 from unnest(s.tags) t where lower(t) like '%' || params.q || '%'))
                      limit 1)
             end as reason
       where params.q is not null
    ) md on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'name', q.name, 'token_prefix', q.token_prefix, 'is_express', q.is_express,
               'status', q.status,
               'waiting_count', coalesce(ql.waiting_count, 0),
               'traffic', coalesce(ql.traffic, 'GREEN'),
               'ewma_service_sec', coalesce(ql.ewma_service_sec, 300),
               'active_counters', coalesce(ql.active_counters, 1),
               'version', coalesce(ql.version, 0)) order by q.name) as queues
        from public.queues q left join public.queue_live ql on ql.queue_id = q.id
       where q.business_id = b.id
    ) qs on true
   where b.status = 'approved'
     and (p_category is null or c.slug = p_category)
     and (params.origin is null or st_dwithin(b.location, params.origin, p_radius_m))
     and (params.q is null or mk.reason is not null or md.reason is not null)
     and (not p_wheelchair or coalesce((b.amenities->>'wheelchair')::boolean, false))
     and (not p_parking or coalesce((b.amenities->>'parking')::boolean, false))
     and (not p_express or exists (select 1 from public.queues q where q.business_id = b.id and q.is_express))
     and (not p_open_now or public.is_open_now(b.opening_hours))
   order by 12 nulls last, b.name
   limit 100;
$$;

-- ---------------------------------------------------------------------
-- queue_alternatives: "Less crowded nearby" (smart distribution)
-- ---------------------------------------------------------------------
create or replace function public.queue_alternatives(p_queue_id uuid, p_radius_m int default 5000)
returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.waiting_count, x.distance_m), '[]'::jsonb)
    from (
      select b.slug, b.name as business_name, q.id as queue_id, q.name as queue_name,
             ql.waiting_count, ql.traffic, ql.ewma_service_sec, ql.active_counters,
             round(st_distance(b.location, ob.location))::int as distance_m
        from public.queues oq
        join public.businesses ob on ob.id = oq.business_id
        join public.queue_live oql on oql.queue_id = oq.id
        join public.businesses b on b.category_id = ob.category_id and b.id <> ob.id and b.status = 'approved'
        join public.queues q on q.business_id = b.id and q.status = 'open'
        join public.queue_live ql on ql.queue_id = q.id
       where oq.id = p_queue_id
         and st_dwithin(b.location, ob.location, p_radius_m)
         -- same kind of service: the two queues' services share at least one tag
         and (oq.service_id is null or exists (
               select 1 from public.services s1, public.services s2
                where s1.id = oq.service_id and s2.id = q.service_id
                  and lower(s1.tags::text)::text[] && lower(s2.tags::text)::text[]))
         and ql.waiting_count < oql.waiting_count
       order by ql.waiting_count, distance_m
       limit 3
    ) x;
$$;

-- ---------------------------------------------------------------------
-- Analytics (business) and platform stats (admin)
-- ---------------------------------------------------------------------
create or replace function public.business_analytics(p_business_id uuid, p_from date, p_to date)
returns jsonb
language sql stable set search_path = public as $$
  with e as (
    select * from public.queue_entries
     where business_id = p_business_id and service_date between p_from and p_to
  )
  select jsonb_build_object(
    'total',      (select count(*) from e),
    'served',     (select count(*) from e where status = 'COMPLETED'),
    'no_show',    (select count(*) from e where status = 'NO_SHOW'),
    'skipped',    (select count(*) from e where status = 'SKIPPED'),
    'cancelled',  (select count(*) from e where status = 'CANCELLED'),
    'waiting',    (select count(*) from e where status = 'WAITING'),
    'avg_wait_sec',    (select round(avg(extract(epoch from called_at - joined_at))) from e where called_at is not null),
    'avg_service_sec', (select round(avg(extract(epoch from finished_at - serving_at))) from e
                         where status = 'COMPLETED' and serving_at is not null),
    'by_counter', (select coalesce(jsonb_agg(jsonb_build_object('counter', c.name, 'served', x.n) order by x.n desc), '[]'::jsonb)
                     from (select counter_id, count(*) n from e where status = 'COMPLETED' and counter_id is not null group by counter_id) x
                     join public.counters c on c.id = x.counter_id),
    'by_day',     (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'total', t, 'served', s) order by d), '[]'::jsonb)
                     from (select service_date d, count(*) t, count(*) filter (where status = 'COMPLETED') s from e group by 1) x),
    'by_source',  (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
                     from (select source, count(*) n from e group by 1) x),
    'heatmap',    (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', n)), '[]'::jsonb)
                     from (select extract(isodow from joined_at at time zone 'Asia/Kolkata')::int dow,
                                  extract(hour   from joined_at at time zone 'Asia/Kolkata')::int hr,
                                  count(*) n
                             from e group by 1, 2) h)
  );
$$;

create or replace function public.admin_stats(p_days int default 14) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'businesses', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                     from (select status, count(*) n from public.businesses group by 1) x),
    'users',      (select count(*) from public.users),
    'tokens_today', (select count(*) from public.queue_entries where service_date = public.app_today()),
    'no_show_rate', (select round(100.0 * count(*) filter (where status = 'NO_SHOW') / greatest(count(*), 1), 1)
                       from public.queue_entries where service_date > public.app_today() - p_days),
    'per_day',    (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'tokens', n) order by d), '[]'::jsonb)
                     from (select service_date d, count(*) n from public.queue_entries
                            where service_date > public.app_today() - p_days group by 1) x),
    'top_businesses', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'slug', b.slug, 'tokens', x.n) order by x.n desc), '[]'::jsonb)
                         from (select business_id, count(*) n from public.queue_entries
                                where service_date > public.app_today() - p_days
                                group by 1 order by 2 desc limit 10) x
                         join public.businesses b on b.id = x.business_id)
  );
$$;

-- ---------------------------------------------------------------------
-- Realtime fan-out: Node LISTENs on these channels and pushes to browsers
-- over Socket.IO. Works for changes made by the API, the cron jobs, psql…
-- ---------------------------------------------------------------------
create or replace function public.tg_notify_broadcast() returns trigger
language plpgsql as $$
begin
  perform pg_notify('broadcast', json_build_object('id', new.id, 'queue_id', new.queue_id)::text);
  return null;
end $$;
create trigger broadcasts_notify after insert on public.broadcasts
  for each row execute function public.tg_notify_broadcast();

create or replace function public.tg_notify_notification() returns trigger
language plpgsql as $$
begin
  perform pg_notify('notification', json_build_object('id', new.id, 'user_id', new.user_id)::text);
  return null;
end $$;
create trigger notifications_notify after insert on public.notifications
  for each row execute function public.tg_notify_notification();
