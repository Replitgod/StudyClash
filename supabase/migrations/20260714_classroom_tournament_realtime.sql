-- Adds a narrow Supabase Realtime layer on top of the classroom tournament
-- tables so the bracket page updates live instead of relying solely on its
-- 20s poll (20260712_classroom_tournaments.sql's "no live/real-time layer"
-- note still holds for battle itself -- solo-vs-AI/ghost stays async. This
-- only makes the bracket's own state changes push to the browser instead of
-- being pulled).
--
-- RLS here is scoped to "room owner or a registered tournament member of
-- that room" (see is_classroom_tournament_participant below) -- NOT the
-- `using (true)` public-read-by-reference pattern
-- 20260711_core_tables_rls_hardening.sql uses for decks/questions/matches.
-- Those tables are fine wide open by design (shareable challenge links,
-- ghost replay). classroom_tournament_members additionally carries a named
-- roster tied to user_id per room, which nothing today needs enumerable
-- table-wide, so this stays scoped instead of copying that wider pattern.
-- The existing GET /api/classroom/tournament/[roomCode] route (service-role,
-- keyed by room code, no per-user check) is untouched and remains the
-- fallback for anyone who only has the room code -- this migration only
-- adds an *additional*, more restrictive path (instant push for
-- authenticated owner/members), it removes no existing capability.
--
-- Safe to run multiple times.

create or replace function public.is_classroom_tournament_participant(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.classroom_rooms
    where id = target_room_id and owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.classroom_tournament_members
    where room_id = target_room_id and user_id = auth.uid()
  );
$$;

drop policy if exists "classroom_rooms_tournament_participant_select" on public.classroom_rooms;
create policy "classroom_rooms_tournament_participant_select"
  on public.classroom_rooms
  for select
  to authenticated
  using (mode = 'tournament' and public.is_classroom_tournament_participant(id));

drop policy if exists "classroom_tournament_members_participant_select" on public.classroom_tournament_members;
create policy "classroom_tournament_members_participant_select"
  on public.classroom_tournament_members
  for select
  to authenticated
  using (public.is_classroom_tournament_participant(room_id));

drop policy if exists "classroom_tournament_matches_participant_select" on public.classroom_tournament_matches;
create policy "classroom_tournament_matches_participant_select"
  on public.classroom_tournament_matches
  for select
  to authenticated
  using (public.is_classroom_tournament_participant(room_id));

-- postgres_changes subscriptions only deliver events for tables in this
-- publication -- the RLS policies above still gate who receives them.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classroom_tournament_matches'
  ) then
    alter publication supabase_realtime add table public.classroom_tournament_matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classroom_tournament_members'
  ) then
    alter publication supabase_realtime add table public.classroom_tournament_members;
  end if;
end $$;
