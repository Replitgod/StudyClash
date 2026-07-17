-- Fixes two issues found running the prior two migrations by hand in the
-- Supabase SQL Editor:
--
-- 1. marketing_destinations was already created (by whatever applied
--    20260721 earlier) before the `unique` constraint on `name` was added
--    to that migration file -- `create table if not exists` is a no-op
--    against an already-existing table, so the constraint never actually
--    reached the live table, and the seed migration's
--    `on conflict (name)` had nothing to match, raising 42P10. Retrofits
--    the constraint here, guarded so it's a no-op if it already exists.
--
-- 2. The mistake_breakdowns user_id backfill assumed matches.user_id
--    exists (per 20260713_matches_user_id.sql's history in this repo),
--    but that was never confirmed against the actual live database.
--    Re-running the backfill here, guarded so it silently skips instead of
--    erroring if that column turns out not to exist.
--
-- Safe to run multiple times.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketing_destinations'::regclass
      and contype = 'u'
  ) then
    alter table public.marketing_destinations add constraint marketing_destinations_name_key unique (name);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mistake_breakdowns' and column_name = 'user_id'
  ) then
    update public.mistake_breakdowns mb
    set user_id = m.user_id
    from public.matches m
    where mb.match_id = m.id
      and mb.user_id is null
      and m.user_id is not null;
  end if;
end $$;
