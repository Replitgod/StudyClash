-- Day-7 retention is a cohort query (per-user first-ever match date, then
-- "did they come back 7+ days later"), which the JS query builder can't
-- express in one round trip -- it genuinely needs a join/aggregate. This
-- is the SQL to compute it, called from /api/admin/stats via the
-- service-role client (which already bypasses RLS on `matches`, so no
-- security definer is needed here -- unlike the classroom-tournament
-- function, this is never exposed to anon/authenticated callers).
--
-- Cohort window is rolling (users whose first-ever match fell between
-- cohort_start and cohort_end), not "joined exactly 7 days ago" -- with a
-- small early user base, a single-day cohort would be too small a sample
-- to mean anything. The admin route passes a ~2-week window ending 7 days
-- ago so every user in the cohort has actually had the chance to return.
--
-- Safe to run multiple times.

create or replace function public.compute_day7_retention(cohort_start timestamptz, cohort_end timestamptz)
returns table(cohort_size bigint, retained_size bigint, retention_rate numeric)
language sql
stable
as $$
  with first_match as (
    select user_id, min(created_at) as first_at
    from public.matches
    where user_id is not null
    group by user_id
  ),
  cohort as (
    select user_id, first_at
    from first_match
    where first_at >= cohort_start and first_at < cohort_end
  ),
  retained as (
    select c.user_id
    from cohort c
    where exists (
      select 1 from public.matches m
      where m.user_id = c.user_id
        and m.created_at >= c.first_at + interval '7 days'
    )
  )
  select
    (select count(*) from cohort)::bigint as cohort_size,
    (select count(*) from retained)::bigint as retained_size,
    case when (select count(*) from cohort) = 0 then null
         else round((select count(*) from retained)::numeric / (select count(*) from cohort) * 100, 1)
    end as retention_rate;
$$;
