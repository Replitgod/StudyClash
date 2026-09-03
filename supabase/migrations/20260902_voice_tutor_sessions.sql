-- Voice tutor sessions: what was said, what was attempted, what stuck.
--
-- Before this, a call left nothing behind. The student talked for ten
-- minutes, VYRA worked out that they kept confusing cations and anions, and
-- then the tab closed and all of it was gone -- the next call opened knowing
-- exactly as little as the first. That is the difference between a voice
-- demo and a tutor, and it is a storage problem, not a model problem.
--
-- Three tables, mirroring the three things a session produces:
--   voice_sessions          one row per call: options, outcome, review
--   voice_turns             the transcript, as committed utterances
--   voice_concept_attempts  one row per judged answer -- the part that
--                           actually feeds learning, since it carries the
--                           verdict and the misconception rather than prose
--
-- Deliberately additive. Nothing here touches `matches`, `match_answers`,
-- `topic_review_schedule` or `question_review_schedule`, so every existing
-- study statistic keeps its current meaning and a bad voice session cannot
-- corrupt a mastery number that was earned on graded questions. The link
-- back into the rest of the app is by topic name, which is what
-- topic_review_schedule is already keyed on.
--
-- Written only by app/api/vyra/voice-session (service-role). RLS is on with
-- a read-your-own policy and no write policy at all, the same shape used by
-- the core tables in 20260711_core_tables_rls_hardening.sql: the anon key is
-- in every page bundle, so a table without this is world-writable by anyone
-- who points a Supabase client at the project.
--
-- Safe to run more than once.

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What they launched it from. source_id is intentionally NOT a foreign key
  -- to decks: a session's history should survive the deck being deleted,
  -- and the title is denormalised below for exactly that reason.
  source_type text not null default 'open'
    check (source_type in ('deck', 'note', 'weak_topics', 'open')),
  source_id uuid,
  source_title text,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer,

  -- 'live' rows are calls that never reported an ending: a closed laptop, a
  -- crashed tab, a lost connection. They are swept by the staleness check in
  -- the API route rather than left to look like sessions in progress
  -- forever.
  status text not null default 'live'
    check (status in ('live', 'completed', 'abandoned', 'failed')),

  -- The start options (style/difficulty/length), stored as given.
  options jsonb not null default '{}'::jsonb,

  -- The computed review. jsonb rather than columns because its shape is
  -- owned by lib/voice/sessionSummary.ts and will change with the teaching,
  -- not with the schema.
  summary jsonb,

  question_count integer not null default 0,
  correct_count integer not null default 0,
  partial_count integer not null default 0,
  incorrect_count integer not null default 0,
  hints_used integer not null default 0,
  concepts_mastered integer not null default 0,

  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_sessions(id) on delete cascade,
  speaker text not null check (speaker in ('student', 'tutor')),
  transcript text not null,
  -- Milliseconds from the start of the call. Ordering by a wall-clock
  -- timestamp is unreliable here because several events can be committed in
  -- the same millisecond when a response completes.
  at_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_concept_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The topic name, not an id: concepts are distilled per session from
  -- whatever material was loaded, so a positional id ('c3') means nothing
  -- outside the call that produced it. The name is what joins this to weak
  -- topics and the mastery map.
  concept_label text not null,

  verdict text not null check (verdict in ('correct', 'partial', 'incorrect', 'unknown')),
  hint_level text not null default 'none'
    check (hint_level in ('none', 'nudge', 'concept', 'breakdown', 'explain')),
  misconception text,
  turn_index integer not null default 0,
  created_at timestamptz not null default now()
);

-- The history list: a student's own sessions, newest first.
create index if not exists voice_sessions_user_started_idx
  on public.voice_sessions (user_id, started_at desc);

-- The staleness sweep looks for old rows still marked live.
create index if not exists voice_sessions_live_idx
  on public.voice_sessions (started_at)
  where status = 'live';

create index if not exists voice_turns_session_idx
  on public.voice_turns (session_id, at_ms);

create index if not exists voice_concept_attempts_session_idx
  on public.voice_concept_attempts (session_id);

-- Feeds "what have they been getting wrong out loud", across sessions.
create index if not exists voice_concept_attempts_user_concept_idx
  on public.voice_concept_attempts (user_id, concept_label);

alter table if exists public.voice_sessions enable row level security;
alter table if exists public.voice_turns enable row level security;
alter table if exists public.voice_concept_attempts enable row level security;

-- Read your own. Writes have no policy, so the browser cannot insert even
-- with a valid session -- everything goes through the service-role route,
-- which is also where the ownership check on the deck being studied lives.
drop policy if exists "voice_sessions_read_own" on public.voice_sessions;
create policy "voice_sessions_read_own"
  on public.voice_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "voice_concept_attempts_read_own" on public.voice_concept_attempts;
create policy "voice_concept_attempts_read_own"
  on public.voice_concept_attempts
  for select
  to authenticated
  using (auth.uid() = user_id);

-- voice_turns has no user_id of its own; ownership is the parent session's.
drop policy if exists "voice_turns_read_own" on public.voice_turns;
create policy "voice_turns_read_own"
  on public.voice_turns
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.voice_sessions s
      where s.id = voice_turns.session_id
        and s.user_id = auth.uid()
    )
  );

comment on table public.voice_sessions is
  'One row per voice tutor call. Written only by app/api/vyra/voice-session.';
comment on column public.voice_sessions.summary is
  'Computed review from lib/voice/sessionSummary.ts. Built from recorded attempt counters, never generated prose, so it cannot claim a mastery the session did not demonstrate.';
comment on column public.voice_sessions.status is
  'live until the call reports an ending. Rows left live past the staleness window are swept to abandoned so an unclosed tab is not mistaken for a session in progress.';
comment on table public.voice_concept_attempts is
  'One judged spoken answer. Keyed by topic name so it can join weak topics and the mastery map, which are keyed the same way.';
