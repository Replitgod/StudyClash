-- Recovery tracking for the mastery engine.
--
-- A "recovery" is a question the student got wrong, had explained to them,
-- and then got right on a fresh question testing the same idea (see
-- app/api/explain-mistake and lib/mistakeRecovery.ts).
--
-- It is tracked separately from correct_count because it is a different --
-- and stronger -- signal. A first-time correct answer might be recall or
-- might be a lucky guess; a recovery is direct evidence that an explanation
-- landed and changed what the student can do. lib/mastery.ts counts each
-- recovery as an extra spaced repetition when computing how long the
-- knowledge should survive, so the two must not be conflated.
--
-- Safe to run multiple times.

alter table public.topic_review_schedule
  add column if not exists recoveries integer not null default 0;

comment on column public.topic_review_schedule.recoveries is
  'Count of missed-then-recovered questions on this topic. Feeds stability in lib/mastery.ts; not the same as correct_count.';

-- Per-question sibling, so a single question that keeps being recovered can
-- be told apart from one that was simply never missed.
alter table public.question_review_schedule
  add column if not exists recoveries integer not null default 0;

comment on column public.question_review_schedule.recoveries is
  'Count of times this exact question was missed and then recovered via a follow-up.';
