-- Calling Vyra about anything, and changing the subject mid-call.
--
-- Until now a voice session had to be grounded in a deck the student already
-- owned: loadStudyMaterial read `decks` and `questions`, and an account with
-- neither got a tutor whose prompt said "they have no material loaded". So
-- the one thing a student most wants from a tutor on a phone call -- "teach
-- me the Krebs cycle" -- was the one thing it could not do, and a new user
-- had to build a deck before the headline feature worked at all.
--
-- Two changes, both additive:
--
--   1. voice_sessions.source_type gains 'topic', for a call grounded in a
--      subject rather than in stored material.
--   2. voice_topic_concepts caches the concept set generated for a topic.
--
-- The cache is the load-bearing half. Generating concepts costs a model call
-- and roughly two seconds, which is tolerable once on a pre-call screen and
-- NOT tolerable mid-call, where the student has just said "actually, switch
-- to algebra 2" and is listening to silence. Keyed on the collapsed topic
-- key from lib/voice/topics.ts, so "Algebra 2", "algebra 2" and "let's do
-- algebra 2" are one row and one generation.
--
-- The cache is shared across users on purpose. It holds no student text: the
-- key is a normalised subject name and the value is a generic concept
-- outline for it, which is the same for everyone who asks. Nothing personal
-- goes in, so nothing personal can come out of a shared read.
--
-- Safe to run more than once.

-- ============================================================
-- voice_sessions.source_type gains 'topic'
-- ============================================================

-- The check constraint is dropped and recreated rather than altered, since
-- Postgres has no "add value to check". Named exactly as the original so a
-- database created before this migration and one created after end up with
-- the same constraint name.
alter table if exists public.voice_sessions
  drop constraint if exists voice_sessions_source_type_check;

alter table if exists public.voice_sessions
  add constraint voice_sessions_source_type_check
  check (source_type in ('deck', 'note', 'weak_topics', 'open', 'topic'));

-- Every topic worked on during the call, in order, including the one it
-- started on. A session that switched from photosynthesis to algebra is two
-- lessons and the review has to name both; before this the row could only
-- remember the title it opened with.
alter table if exists public.voice_sessions
  add column if not exists topics_covered jsonb not null default '[]'::jsonb;

comment on column public.voice_sessions.topics_covered is
  'Ordered list of topic labels taught in this call, including mid-call switches. source_title only ever held the opening one.';

-- ============================================================
-- voice_topic_concepts (generated concept cache)
-- ============================================================

create table if not exists public.voice_topic_concepts (
  id uuid primary key default gen_random_uuid(),

  -- topicKey() from lib/voice/topics.ts: lowercased, depunctuated, lead-ins
  -- stripped. The whole point is that many spellings collapse onto one row.
  topic_key text not null,

  -- Concepts for "photosynthesis" at elementary level are not the concepts
  -- for it at undergraduate level, so level is part of the identity rather
  -- than a filter applied afterwards.
  level text not null default 'unspecified',

  -- The topic as the student actually phrased it, for display. The first
  -- spelling wins; it is only ever shown back to the person who asked.
  topic_label text not null,

  -- Concept[] from lib/voice/types.ts. jsonb because its shape is owned by
  -- the tutoring code and will change with the teaching, not the schema.
  concepts jsonb not null,

  model text,
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now(),
  use_count integer not null default 1,

  -- One row per (topic, level). This is what makes the cache a cache.
  constraint voice_topic_concepts_key_level_unique unique (topic_key, level)
);

-- The read path on every call start and every mid-call switch is an exact
-- lookup on (topic_key, level), which the unique constraint already indexes.
-- This one is for the eviction/refresh sweep: least recently used first.
create index if not exists voice_topic_concepts_used_idx
  on public.voice_topic_concepts (used_at);

alter table if exists public.voice_topic_concepts enable row level security;

-- No policy of any kind, deliberately.
--
-- With RLS on and no policy, the anon and authenticated roles can neither
-- read nor write this table; only the service-role client can, which is the
-- same shape used for every other table the browser has no business
-- touching. A student reaches these concepts through
-- /api/vyra/topic-concepts, which is authenticated and rate limited --
-- direct client access would be an uncapped, unauthenticated way to spend
-- money on model calls.

comment on table public.voice_topic_concepts is
  'Cache of AI-generated concept outlines per (topic, level), so a mid-call topic switch does not cost a model round trip. Contains no student text. Service-role only.';
comment on column public.voice_topic_concepts.topic_key is
  'topicKey() from lib/voice/topics.ts. Collapses spelling, case, punctuation and spoken lead-ins onto one key.';
