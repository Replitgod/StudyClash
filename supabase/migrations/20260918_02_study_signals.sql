-- The signals the study loop was missing, and real flashcards.
--
-- 1. questions.choice_feedback
--    Why each wrong option is wrong, keyed by the option's text. Written by
--    the question writer at generation time, so the moment a student picks
--    a wrong option they see why THAT option is wrong -- instantly, with no
--    model call, and specific to what they actually chose.
--
-- 2. flashcards / flashcard_state
--    The Flashcards tab used to show each multiple-choice stem as a card
--    ("Which of the following...?" with the options stripped), and kept the
--    student's ratings in localStorage, where they never reached mastery,
--    never scheduled a review, and vanished on another device. Cards are now
--    written as cards, and review state lives per student on the server.
--    Content and state are separate tables because a published deck's cards
--    are readable by anyone with the link, and a student's lapses are not.
--
-- 3. match_answers.confidence, topic_review_schedule.confident_misses
--    How sure the student was before they saw the answer. A confident wrong
--    answer is a misconception -- the most important thing to fix and the
--    least likely to fix itself -- and until now it looked exactly like a
--    guess.
--
-- 4. profiles learning columns
--    What the student is studying for and by when, collected in onboarding
--    and used to decide what Home recommends. Written only through
--    /api/profile/learning (service role); the browser's column grants
--    from 20260918_01 are deliberately not widened.
--
-- Safe to run more than once. Requires 20260918_01_privacy_lockdown.sql
-- (for public.deck_is_readable).

-- ------------------------------------------------------ choice feedback

alter table if exists public.questions
  add column if not exists choice_feedback jsonb;

comment on column public.questions.choice_feedback is
  'Map of wrong-option text to one sentence on why it is wrong. Written at generation time.';

-- ----------------------------------------------------------- flashcards

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  front text not null,
  back text not null,
  note text,
  topic text not null default 'General',
  kind text not null default 'concept'
    check (kind in ('definition', 'concept', 'application', 'reverse')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Unique, not just indexed: two tabs opening an older set at the same moment
-- both write its cards, and the second insert must fail rather than double
-- the deck.
create unique index if not exists flashcards_deck_position_key
  on public.flashcards (deck_id, position);

alter table public.flashcards enable row level security;

-- Readable exactly when its deck is. Writes go through the API only.
drop policy if exists "flashcards_read" on public.flashcards;
create policy "flashcards_read"
  on public.flashcards
  for select
  to anon, authenticated
  using (public.deck_is_readable(deck_id));

create table if not exists public.flashcard_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  ease numeric(4, 2) not null default 2.50,
  interval_days numeric(7, 2) not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  last_rating text check (last_rating in ('again', 'hard', 'good', 'easy')),
  due_at timestamptz,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

create index if not exists flashcard_state_user_due_idx
  on public.flashcard_state (user_id, due_at);

create index if not exists flashcard_state_user_deck_idx
  on public.flashcard_state (user_id, deck_id);

alter table public.flashcard_state enable row level security;

-- A student reads their own review state and nobody else's. Writes go
-- through /api/flashcards/review, which also credits the topic's mastery.
drop policy if exists "flashcard_state_read_own" on public.flashcard_state;
create policy "flashcard_state_read_own"
  on public.flashcard_state
  for select
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------- confidence

alter table if exists public.match_answers
  add column if not exists confidence text
    check (confidence in ('sure', 'unsure', 'guess'));

alter table if exists public.topic_review_schedule
  add column if not exists confident_misses integer not null default 0;

comment on column public.topic_review_schedule.confident_misses is
  'Answers the student marked "sure" and got wrong: misconceptions, not slips.';

-- ------------------------------------------------------ learner profile

alter table if exists public.profiles
  add column if not exists education_level text,
  add column if not exists target_exam text,
  add column if not exists exam_date date,
  add column if not exists daily_goal integer,
  add column if not exists onboarded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_daily_goal_range'
  ) then
    alter table public.profiles
      add constraint profiles_daily_goal_range
      check (daily_goal is null or (daily_goal between 5 and 200));
  end if;
end $$;

-- ------------------------------------------------ mistake explanations

-- The breakdown of one wrong answer, cached by (question, chosen option).
-- Every student who picks the same wrong option on the same question gets
-- the same misconception analysis; writing it again each time cost a model
-- call and several seconds of the student waiting on a wrong answer. Holds
-- no student data: the key is a question id and a hash of an option's text.
create table if not exists public.mistake_explanations (
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (question_id, answer_hash)
);

-- Service role only: no policies, so the browser can neither read nor write.
alter table public.mistake_explanations enable row level security;
