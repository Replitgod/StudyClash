-- Let a processed course become a deck a student actually reviews.
--
-- The curriculum pipeline and the study app have been two separate systems
-- sharing a database. A document went through eight stages and produced
-- rows in `curriculum_questions`; nothing in the study app has ever read
-- that table. The course page could list a concept's questions with the
-- answers visible, which is reading, not retrieval practice.
--
-- The consequence was quiet and expensive: nothing a student uploaded ever
-- entered the SM-2 schedule, counted toward mastery, or reached Vyra. The
-- question the whole product is built to answer -- "what am I forgetting?"
-- -- structurally could not include a student's own material.
--
-- Two columns are enough to bridge it, because the two schemas already
-- agree on the important convention: both store a multiple choice answer as
-- the choice's TEXT rather than a letter, so no answer-key translation is
-- involved and there is no opportunity to get one wrong.
--
-- Safe to run more than once.

-- ============================================================
-- Which course a deck was built from
-- ============================================================

-- Nullable because almost no deck has a course: decks made from a pasted
-- topic, an Anki import, or a Quizlet set have no upstream course and never
-- will. `on delete set null` rather than cascade -- deleting a course must
-- not delete a deck the student has been reviewing for weeks. They lose the
-- ability to sync new cards in, not their study history.
alter table public.decks
  add column if not exists source_course_id uuid references public.courses(id) on delete set null;

create index if not exists idx_decks_source_course
  on public.decks(source_course_id)
  where source_course_id is not null;

comment on column public.decks.source_course_id is
  'The curriculum course this deck was built from, when it was built from one. Null for decks created from a topic, an import, or pasted notes.';

-- ============================================================
-- Which generated question a card came from
-- ============================================================

-- This is what makes syncing idempotent. Uploading chapter two and
-- rebuilding should add the new cards and leave the existing ones alone --
-- including their review schedule, ease factors and streaks, which live on
-- question_review_schedule keyed by question_id. Without this link the only
-- way to "rebuild" a deck would be to delete and recreate its cards, which
-- would silently reset every SM-2 interval the student had earned.
alter table public.questions
  add column if not exists source_curriculum_question_id uuid
    references public.curriculum_questions(id) on delete set null;

-- Partial unique: one card per generated question, while leaving the
-- overwhelming majority of cards (which have no curriculum source) free to
-- hold null without colliding with each other.
create unique index if not exists questions_source_curriculum_question_unique
  on public.questions(source_curriculum_question_id)
  where source_curriculum_question_id is not null;

comment on column public.questions.source_curriculum_question_id is
  'The curriculum_questions row this card was generated from. Makes a course-to-deck sync idempotent: an existing card is left untouched, preserving its SM-2 schedule, rather than being deleted and recreated.';
