-- Adds support for a third question format alongside multiple_choice/
-- true_false: "open_response" (argumentation battles and step-by-step STEM
-- battles), where the student types a free-text answer instead of picking
-- from answer_choices, and grading happens via an LLM rubric check
-- (see /api/grade-open-response) rather than exact-match comparison.
--
-- question_type was previously only tracked at generation time (deck-level
-- request param), never persisted per-row -- this is the first migration to
-- stamp it onto the questions table itself. Existing rows default to
-- 'multiple_choice', which is accurate for every row written before this
-- migration (true_false questions are distinguishable by their answer_choices
-- being exactly ["True","False"], not by this column, and don't need to be
-- backfilled differently since the app only branches UI on
-- question_type === 'open_response').
--
-- rubric_points/reasoning_format are only ever populated for open_response
-- rows; existing multiple_choice/true_false rows continue using
-- answer_choices/correct_answer exactly as before -- no existing column's
-- meaning changes.
--
-- Safe to run multiple times.

alter table if exists public.questions
  add column if not exists question_type text not null default 'multiple_choice';

alter table if exists public.questions
  add column if not exists rubric_points jsonb;

alter table if exists public.questions
  add column if not exists reasoning_format text;
