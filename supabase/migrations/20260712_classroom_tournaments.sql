-- Tournament Mode: single-elimination brackets on top of the existing
-- classroom_rooms infrastructure (20260709_growth_foundations.sql).
--
-- There is no live/real-time layer anywhere in this app (no websockets,
-- no presence, no cron for this) -- battle itself is solo-vs-AI/ghost, not
-- live human-vs-human. So a bracket "match" here is asynchronous: both
-- paired students independently play the room's deck through the normal
-- /battle/[deckId] flow, and whichever of them posts the higher score to
-- `matches` AFTER the pairing was created wins the slot. Resolution and
-- next-round generation both happen lazily whenever anyone requests the
-- bracket (see /api/classroom/tournament/[roomCode]), the same
-- compute-on-read pattern Mastery Map and ClashRank already use -- no cron
-- or websocket infrastructure needed.
--
-- Safe to run multiple times.

alter table if exists public.classroom_rooms
  add column if not exists mode text not null default 'practice';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'classroom_rooms_mode_check'
  ) then
    alter table public.classroom_rooms
      add constraint classroom_rooms_mode_check check (mode in ('practice', 'tournament'));
  end if;
end $$;

-- classroom/join never required a persisted roster before (it just
-- resolved room -> deck and handed back a battle link) -- tournament mode
-- needs to know who actually registered before generating a bracket.
--
-- user_id is required (not nullable) here, unlike the guest-friendly
-- player_name-only pattern used elsewhere (matches, challenge_notifications):
-- bracket resolution has to match a student's tournament registration
-- against their later battle/finish submission across two separate
-- requests, and a free-typed name is too easy to enter differently between
-- them. /api/classroom/join requires login for tournament-mode rooms
-- specifically (practice-mode rooms remain guest-friendly) so this can key
-- off the same user_id battle/finish already stamps reliably.
create table if not exists public.classroom_tournament_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.classroom_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  joined_at timestamptz not null default now()
);

create unique index if not exists classroom_tournament_members_room_user_key
  on public.classroom_tournament_members (room_id, user_id);

create table if not exists public.classroom_tournament_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.classroom_rooms(id) on delete cascade,
  round integer not null,
  slot integer not null,
  player_a_user_id uuid references auth.users(id) on delete set null,
  player_a_name text,
  player_b_user_id uuid references auth.users(id) on delete set null,
  player_b_name text,
  player_a_score integer,
  player_b_score integer,
  winner_user_id uuid references auth.users(id) on delete set null,
  winner_name text,
  status text not null default 'pending' check (status in ('pending', 'complete', 'bye')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists classroom_tournament_matches_room_round_slot_key
  on public.classroom_tournament_matches (room_id, round, slot);

create index if not exists idx_classroom_tournament_matches_room_round
  on public.classroom_tournament_matches (room_id, round);

alter table public.classroom_tournament_members enable row level security;
alter table public.classroom_tournament_matches enable row level security;

-- Written/read only via /api/classroom/tournament/* (service-role), same
-- as classroom_rooms -- no anon/authenticated policies.
