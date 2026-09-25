-- =====================================================================
-- QueLess · 0003 · Lock-down
-- The browser NEVER talks to the database. Only the Node API connects
-- (with the DATABASE_URL owner role). If you host Postgres on Supabase,
-- Supabase also exposes a public REST API with its anon key; turning RLS on
-- with NO policies makes every table invisible there (password hashes,
-- sessions, tokens...). The table owner (our server) is not affected.
-- =====================================================================
set search_path = public, extensions;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Supabase-only roles: remove their default privileges if they exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;
