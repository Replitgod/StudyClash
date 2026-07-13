-- Per-question spaced repetition. topic_review_schedule (see
-- 20260712_srs_review_schedule.sql) only tracks mastery at the topic
-- level -- a student can look "mastered" on a topic while one specific
-- question within it is still shaky, because the signal never drops below
-- topic granularity. This table adds the finer-grained layer: each
-- individual question gets its own recall state, so weak-topic rematch can
-- target the exact questions a student is actually missing instead of
-- "anything tagged with this topic label."
--
-- Status comes from a correct-streak, not cumulative accuracy (a single
-- question's accuracy over a handful of attempts is too noisy) -- see
-- getQuestionStatus in lib/srsSchedule.ts. Interval growth reuses the same
-- getReviewIntervalDays math the topic table already uses.
--
-- Same RLS shape as topic_review_schedule: written only via
-- /api/battle/finish and read only via /api/mastery/due-questions, both
-- service-role. No anon/authenticated policies.
--
-- Safe to run multiple times.

create table if not exists public.question_review_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  player_name text,
  deck_id uuid not null references public.decks(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status text not null check (status in ('weak', 'improving', 'mastered')),
  correct_streak integer not null default 0,
  correct_count integer not null default 0,
  total_count integer not null default 0,
  last_practiced_at timestamptz not null default now(),
  next_review_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_review_schedule_owner_present check (
    user_id is not null or player_name is not null
  )
);

create unique index if not exists question_review_schedule_user_question_key
  on public.question_review_schedule (user_id, question_id)
  where user_id is not null;

create unique index if not exists question_review_schedule_player_question_key
  on public.question_review_schedule (player_name, question_id)
  where user_id is null and player_name is not null;

-- Used by /api/mastery/due-questions, which scans one deck's rows at a
-- time (unlike the topic table's cron, which scans globally by
-- next_review_at across all decks).
create index if not exists idx_question_review_schedule_deck
  on public.question_review_schedule (deck_id, user_id);

alter table if exists public.question_review_schedule enable row level security;
