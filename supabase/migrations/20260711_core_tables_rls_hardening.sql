-- Pre-launch RLS hardening for tables read/written directly by the browser
-- client (anon key), found via a full audit of every `supabase.from(...)`
-- call in app/. Two problems this fixes:
--
-- 1. `mistake_breakdowns` had a select policy scoped `using (true)` with no
--    reference check at all -- any authenticated account could dump the
--    entire table (every student's missed questions, selected answers, and
--    misunderstood-concept notes), not just the match_id-scoped subset the
--    app itself ever queries.
-- 2. `decks`, `questions`, `matches`, `match_answers`, `profiles`,
--    `generation_logs`, and `membership_plans` had NO row level security in
--    this repo's migration history at all. The app's own filters
--    (`.eq("user_id", user.id)`, etc.) are client-side query conveniences,
--    not access control -- without RLS, any anon-key holder (i.e. anyone,
--    since the anon key ships in every page bundle) can bypass those
--    filters entirely via a raw REST call: read every user's decks/notes,
--    or worse, INSERT a fake `matches` row with an arbitrary score to
--    forge the leaderboard without ever calling /api/battle/finish.
--
-- Design note: decks/questions/matches/match_answers/mistake_breakdowns are
-- intentionally kept readable "by reference" (to anon + authenticated, no
-- ownership check) because the app already relies on that for shareable
-- challenge links (app/challenge/[matchId]), cross-player leaderboards
-- (app/decks/[deckId], app/clashrank), and ghost-replay (app/battle). This
-- migration does not change that read behavior -- it only removes the
-- ability to WRITE to these tables via the anon/authenticated client (every
-- write already goes through a service-role API route: generate-questions,
-- battle/finish, mistake-breakdown), and it removes mistake_breakdowns'
-- unscoped enumeration.
--
-- Safe to run multiple times.

-- decks: public read-by-reference, no client writes.
alter table if exists public.decks enable row level security;
drop policy if exists "decks_read" on public.decks;
create policy "decks_read"
  on public.decks
  for select
  to anon, authenticated
  using (true);

-- questions: public read-by-reference, no client writes.
alter table if exists public.questions enable row level security;
drop policy if exists "questions_read" on public.questions;
create policy "questions_read"
  on public.questions
  for select
  to anon, authenticated
  using (true);

-- matches: public read-by-reference (leaderboards, ghost replay), no client
-- writes -- scores must go through /api/battle/finish's server-side
-- validation, never a direct insert.
alter table if exists public.matches enable row level security;
drop policy if exists "matches_read" on public.matches;
create policy "matches_read"
  on public.matches
  for select
  to anon, authenticated
  using (true);

-- match_answers: same pattern as matches.
alter table if exists public.match_answers enable row level security;
drop policy if exists "match_answers_read" on public.match_answers;
create policy "match_answers_read"
  on public.match_answers
  for select
  to anon, authenticated
  using (true);

-- mistake_breakdowns: keep the same read shape as matches/match_answers
-- (this table is always queried scoped by match_id, alongside those two)
-- instead of the previous untargeted "authenticated, using (true)" policy.
drop policy if exists "authenticated_read_mistake_breakdowns" on public.mistake_breakdowns;
drop policy if exists "mistake_breakdowns_read" on public.mistake_breakdowns;
create policy "mistake_breakdowns_read"
  on public.mistake_breakdowns
  for select
  to anon, authenticated
  using (true);

-- profiles: a user may only ever read or update their OWN row. No client
-- inserts (rows are created by a database trigger on signup) or deletes.
-- Note: this does not prevent a user from including `plan` in their own
-- update payload -- account/page.tsx only ever sends `display_name`, but
-- RLS alone can't cleanly enforce "this column may never change via the
-- client" without a BEFORE UPDATE trigger. Recommend adding one that pins
-- `plan`/`email`/`id` to their existing values on any client-originated
-- update, since plan changes must only happen server-side (checkout webhook
-- / admin action).
alter table if exists public.profiles enable row level security;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- generation_logs: a user may read only their own usage counters (used to
-- show remaining daily generations client-side). No client writes -- logs
-- are inserted server-side only, inside generate-questions.
alter table if exists public.generation_logs enable row level security;
drop policy if exists "generation_logs_read_own" on public.generation_logs;
create policy "generation_logs_read_own"
  on public.generation_logs
  for select
  to authenticated
  using (user_id = auth.uid());

-- membership_plans: public reference data (plan names, daily limits) --
-- every account needs to read every plan row (e.g. to render pricing/limits
-- for plans the user isn't currently on).
alter table if exists public.membership_plans enable row level security;
drop policy if exists "membership_plans_read" on public.membership_plans;
create policy "membership_plans_read"
  on public.membership_plans
  for select
  to anon, authenticated
  using (true);

-- Defense in depth: these tables are only ever touched server-side via the
-- service-role key (which always bypasses RLS), never by the browser
-- client. Enabling RLS with zero anon/authenticated policies costs nothing
-- functionally and closes them off completely if a client ever queries them
-- directly by mistake or a future regression adds a client-side call.
alter table if exists public.classroom_rooms enable row level security;
alter table if exists public.study_groups enable row level security;
alter table if exists public.study_group_members enable row level security;
alter table if exists public.email_notification_queue enable row level security;
alter table if exists public.generation_cache enable row level security;
