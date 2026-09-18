-- Close the two holes that let one account read or rewrite another's data.
--
-- 1. Every student's notes were public.
--
--    20260711_core_tables_rls_hardening.sql gave decks, questions, matches,
--    match_answers and mistake_breakdowns a SELECT policy of `using (true)`
--    for anon and authenticated, so that challenge links, tournaments and
--    ghost replays could read a deck "by reference". The anon key ships in
--    every page bundle, so `using (true)` is not "by reference", it is
--    "to anyone": one REST call returned every deck's raw_notes and
--    student_name, and every student's wrong answers and misconceptions.
--
--    A deck is now readable only when there is a reason for this caller to
--    read it: they own it, its owner published it, it has a live challenge
--    link, or it is a classroom room's deck. Questions, matches, answers and
--    breakdowns inherit that, so nothing a student never shared is visible
--    to anyone but them. Every flow that legitimately reads another
--    student's deck (a challenge, a tournament, a published set, a ghost
--    replay on a shared deck) sits inside one of those four reasons.
--
-- 2. A student could make themselves Pro.
--
--    profiles_update_own let a signed-in user update ANY column of their own
--    row, including `plan` and `stripe_customer_id`. The same migration
--    noted it and recommended a trigger that was never written. One
--    browser-console call set plan = 'founder'; pointing
--    stripe_customer_id at somebody else's customer opened THEIR billing
--    portal. Column-level grants fix it at the source: the browser may
--    update the handful of preference columns and nothing else. The service
--    role (checkout webhook, admin) is unaffected.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- helper

-- SECURITY DEFINER so it can see matches.share_token and classroom_rooms,
-- which the calling role cannot read directly. It answers one yes/no
-- question and returns no row data, so running with elevated rights leaks
-- nothing beyond "this deck is shared".
create or replace function public.deck_is_readable(p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.decks d
      where d.id = p_deck_id
        and (
          (d.user_id is not null and d.user_id = auth.uid())
          or coalesce(d.is_public, false)
        )
    )
    or exists (
      select 1 from public.matches m
      where m.deck_id = p_deck_id
        and m.share_token is not null
        and (m.share_token_expires_at is null or m.share_token_expires_at > now())
    )
    or exists (
      select 1 from public.classroom_rooms r
      where r.deck_id = p_deck_id
    );
$$;

revoke all on function public.deck_is_readable(uuid) from public;
grant execute on function public.deck_is_readable(uuid) to anon, authenticated;

-- The challenge clause is the hot path inside the policy; keep it an index
-- probe rather than a scan of every match on the deck.
create index if not exists matches_deck_shared_idx
  on public.matches (deck_id)
  where share_token is not null;

-- ---------------------------------------------------------------- decks

drop policy if exists "decks_read" on public.decks;
create policy "decks_read"
  on public.decks
  for select
  to anon, authenticated
  using (public.deck_is_readable(id));

-- ------------------------------------------------------------ questions

drop policy if exists "questions_read" on public.questions;
create policy "questions_read"
  on public.questions
  for select
  to anon, authenticated
  using (public.deck_is_readable(deck_id));

-- -------------------------------------------------------------- matches

-- Your own sessions always; anyone else's only on a deck you can see
-- (leaderboards and ghost replays exist only on shared decks).
drop policy if exists "matches_read" on public.matches;
create policy "matches_read"
  on public.matches
  for select
  to anon, authenticated
  using (
    (user_id is not null and user_id = auth.uid())
    or public.deck_is_readable(deck_id)
  );

-- --------------------------------------------------------- match_answers

-- Evaluated as the caller, so this is exactly "the match is visible to me".
drop policy if exists "match_answers_read" on public.match_answers;
create policy "match_answers_read"
  on public.match_answers
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.matches m where m.id = match_answers.match_id)
  );

-- ---------------------------------------------------- mistake_breakdowns

drop policy if exists "mistake_breakdowns_read" on public.mistake_breakdowns;
create policy "mistake_breakdowns_read"
  on public.mistake_breakdowns
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.matches m where m.id = mistake_breakdowns.match_id)
  );

-- -------------------------------------------------------------- profiles

-- Row policy stays "your own row"; the grant now says which columns.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, roasts_enabled) on public.profiles to authenticated;
