-- Spaced-repetition auto-scheduling. Persists a per (owner, deck, topic)
-- review schedule so a cron job can notify students when a weak topic comes
-- due, without needing to replicate the client-side aggregation that
-- app/mastery-map/page.tsx already does live from matches/match_answers.
--
-- Scope note: this table is intentionally DECK-scoped per topic (not
-- cross-deck like Mastery Map's live view, which aggregates a topic name
-- across every deck the student has). That's a deliberate simplification --
-- it keeps the write path on battle finish cheap (one deck's history) and
-- still gives an actionable "review this topic in this deck" link. The two
-- views can disagree slightly on accuracy for topics that repeat across
-- multiple decks; Mastery Map remains the source of truth for the student-
-- facing dashboard, this table only drives the async reminder loop.
--
-- Safe to run multiple times.

create table if not exists public.topic_review_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  player_name text,
  deck_id uuid not null references public.decks(id) on delete cascade,
  topic text not null,
  status text not null check (status in ('weak', 'improving', 'mastered')),
  correct_count integer not null default 0,
  total_count integer not null default 0,
  attempts integer not null default 0,
  last_practiced_at timestamptz not null default now(),
  next_review_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_review_schedule_owner_present check (
    user_id is not null or player_name is not null
  )
);

create unique index if not exists topic_review_schedule_user_deck_topic_key
  on public.topic_review_schedule (user_id, deck_id, topic)
  where user_id is not null;

create unique index if not exists topic_review_schedule_player_deck_topic_key
  on public.topic_review_schedule (player_name, deck_id, topic)
  where user_id is null and player_name is not null;

-- Used by the cron job to find due, not-yet-notified rows without a scan.
create index if not exists idx_topic_review_schedule_due
  on public.topic_review_schedule (next_review_at)
  where notified_at is null;

alter table public.topic_review_schedule enable row level security;

-- Written only via /api/battle/finish and read only via the /api/cron/*
-- job, both service-role. No anon/authenticated policies, matching the
-- classroom_rooms pattern (20260709_growth_foundations.sql).

alter table if exists public.challenge_notifications
  drop constraint if exists challenge_notifications_event_type_check;

alter table if exists public.challenge_notifications
  add constraint challenge_notifications_event_type_check check (
    event_type in (
      'crown_taken',
      'challenge_received',
      'ghost_battle_available',
      'srs_review_due'
    )
  );
