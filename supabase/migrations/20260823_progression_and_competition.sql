-- Progression (XP, levels, streaks, quests, achievements), competitive
-- ranking (seasons, ratings), and the friend graph.
--
-- Two rules shape everything here:
--
-- 1. Nothing is a stored number that could drift from reality. XP, ratings
--    and quest progress are each backed by an append-only event table, so
--    every figure the product shows a student can be traced to the session
--    that earned it. A leaderboard nobody can audit is a leaderboard nobody
--    should trust.
--
-- 2. Anything competitive is written service-role only. A client that can
--    write its own rating is not running a ranked ladder, it is running an
--    honour system -- so the read policies below are for authenticated
--    users and the writes all go through /api/* with the service client.
--
-- Safe to run multiple times.

/* ==========================================================================
   Progression
   ========================================================================== */

create table if not exists public.player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp bigint not null default 0,
  -- Denormalised from xp for cheap reads; recomputed from xp on every write
  -- by lib/progression.ts, never incremented independently.
  level integer not null default 1,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  -- A date, not a timestamp: a streak is about days, and storing an instant
  -- makes "did they study today" depend on the reader's timezone.
  last_active_on date,
  -- Earned, not bought. Spent automatically to save a streak after a missed
  -- day so one bad day does not erase a month (see section 19: no
  -- dark-pattern guilt).
  streak_freezes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_progress enable row level security;

drop policy if exists "player_progress_owner_read" on public.player_progress;
create policy "player_progress_owner_read"
  on public.player_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

-- The audit trail behind `player_progress.xp`. Append-only.
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  -- What earned it, from the XP_REASONS map in lib/progression.ts.
  reason text not null,
  -- The match / question / quest it came from, so a single source event can
  -- never be paid out twice.
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_xp_events_user_created
  on public.xp_events (user_id, created_at desc);

-- Idempotency: the same reason from the same source pays exactly once,
-- however many times a flaky client retries the request.
create unique index if not exists xp_events_user_reason_source_key
  on public.xp_events (user_id, reason, source_id)
  where source_id is not null;

alter table public.xp_events enable row level security;

drop policy if exists "xp_events_owner_read" on public.xp_events;
create policy "xp_events_owner_read"
  on public.xp_events
  for select
  to authenticated
  using (auth.uid() = user_id);

/* ==========================================================================
   Daily quests
   ========================================================================== */

create table if not exists public.daily_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The local date this quest belongs to. Quests reset by day, not by a
  -- rolling 24h window, so "today's quests" means the same thing all day.
  quest_date date not null,
  quest_key text not null,
  target integer not null,
  progress integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists daily_quests_user_date_key
  on public.daily_quests (user_id, quest_date, quest_key);

create index if not exists idx_daily_quests_user_date
  on public.daily_quests (user_id, quest_date desc);

alter table public.daily_quests enable row level security;

drop policy if exists "daily_quests_owner_read" on public.daily_quests;
create policy "daily_quests_owner_read"
  on public.daily_quests
  for select
  to authenticated
  using (auth.uid() = user_id);

/* ==========================================================================
   Achievements
   ========================================================================== */

-- Static catalogue. Seeded below and readable by everyone, so a locked
-- achievement can show what it takes to earn it rather than a grey box.
create table if not exists public.achievements (
  key text primary key,
  title text not null,
  description text not null,
  category text not null default 'learning',
  -- How many of the underlying thing are needed. 1 for one-off events.
  target integer not null default 1,
  sort_order integer not null default 100
);

alter table public.achievements enable row level security;

drop policy if exists "achievements_public_read" on public.achievements;
create policy "achievements_public_read"
  on public.achievements
  for select
  to authenticated
  using (true);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null references public.achievements(key) on delete cascade,
  progress integer not null default 0,
  earned_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

alter table public.user_achievements enable row level security;

drop policy if exists "user_achievements_owner_read" on public.user_achievements;
create policy "user_achievements_owner_read"
  on public.user_achievements
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Every achievement here is earned by doing something that actually
-- improves learning. Nothing is awarded for a trivial click (section 55).
insert into public.achievements (key, title, description, category, target, sort_order)
values
  ('comeback_kid', 'Comeback Kid', 'Recover 10 concepts after first getting them wrong.', 'learning', 10, 10),
  ('first_recovery', 'Second Look', 'Fix your first mistake with a follow-up question.', 'learning', 1, 20),
  ('perfect_round', 'Perfect Round', 'Finish a session without a single mistake.', 'mastery', 1, 30),
  ('locked_in', 'Locked In', 'Study meaningfully seven days running.', 'consistency', 7, 40),
  ('month_of_focus', 'Month of Focus', 'Reach a 30-day streak.', 'consistency', 30, 50),
  ('unit_master', 'Unit Master', 'Reach durable mastery across a full unit.', 'mastery', 1, 60),
  ('giant_slayer', 'Giant Slayer', 'Beat an opponent rated 200 above you.', 'competitive', 1, 70),
  ('weakness_crusher', 'Weakness Crusher', 'Take 25 weak topics up to strong.', 'mastery', 25, 80),
  ('deep_work', 'Deep Work', 'Answer 500 questions.', 'learning', 500, 90),
  ('the_long_game', 'The Long Game', 'Keep a topic mastered for 30 days.', 'mastery', 1, 100)
on conflict (key) do update
  set title = excluded.title,
      description = excluded.description,
      category = excluded.category,
      target = excluded.target,
      sort_order = excluded.sort_order;

/* ==========================================================================
   Seasons and ranked rating
   ========================================================================== */

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- At most one active season at a time; the ladder is meaningless otherwise.
create unique index if not exists seasons_single_active
  on public.seasons (is_active)
  where is_active;

alter table public.seasons enable row level security;

drop policy if exists "seasons_public_read" on public.seasons;
create policy "seasons_public_read"
  on public.seasons
  for select
  to authenticated
  using (true);

create table if not exists public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  -- Ranks are per subject: being strong at Algebra says nothing about
  -- Chemistry, and one global number would hide both.
  subject text not null default 'overall',
  rating integer not null default 1000,
  peak_rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  -- Rating deviation, Glicko-style: how uncertain this rating still is.
  -- High for a new player, so early results move them quickly.
  deviation integer not null default 350,
  updated_at timestamptz not null default now()
);

create unique index if not exists player_ratings_user_season_subject_key
  on public.player_ratings (user_id, season_id, subject);

create index if not exists idx_player_ratings_leaderboard
  on public.player_ratings (season_id, subject, rating desc);

alter table public.player_ratings enable row level security;

-- Ratings are readable by any signed-in user: that is what makes a
-- leaderboard possible. Writes are service-role only.
drop policy if exists "player_ratings_read" on public.player_ratings;
create policy "player_ratings_read"
  on public.player_ratings
  for select
  to authenticated
  using (true);

-- The audit trail behind every rating. Without it "you lost 24 rating" is
-- a number the student has no way to check.
create table if not exists public.rating_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  subject text not null default 'overall',
  delta integer not null,
  rating_after integer not null,
  opponent_label text,
  opponent_rating integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_rating_changes_user_created
  on public.rating_changes (user_id, created_at desc);

-- One rating change per match per subject, so a retried finish request
-- cannot pay out twice.
create unique index if not exists rating_changes_match_subject_key
  on public.rating_changes (match_id, user_id, subject)
  where match_id is not null;

alter table public.rating_changes enable row level security;

drop policy if exists "rating_changes_owner_read" on public.rating_changes;
create policy "rating_changes_owner_read"
  on public.rating_changes
  for select
  to authenticated
  using (auth.uid() = user_id);

/* ==========================================================================
   Friends
   ========================================================================== */

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (from_user_id <> to_user_id)
);

-- One live request per direction. A declined request can be re-sent later,
-- so the constraint only covers pending ones.
create unique index if not exists friend_requests_pending_key
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

create index if not exists idx_friend_requests_incoming
  on public.friend_requests (to_user_id, status, created_at desc);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_participant_read" on public.friend_requests;
create policy "friend_requests_participant_read"
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- A friendship is stored once, not twice, with the smaller uuid first. Two
-- rows per friendship is how "A is friends with B but B is not friends with
-- A" bugs happen.
create table if not exists public.friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_ordered check (user_low < user_high)
);

create index if not exists idx_friendships_high
  on public.friendships (user_high);

alter table public.friendships enable row level security;

drop policy if exists "friendships_participant_read" on public.friendships;
create policy "friendships_participant_read"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_low or auth.uid() = user_high);
