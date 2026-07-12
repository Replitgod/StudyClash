-- Adds an optional per-question source citation: a short, verbatim quote
-- from the deck's raw_notes that the generator used to answer the question.
-- Populated by /api/generate-questions (see runGroundingCheck / the
-- source_excerpt prompt field) and only ever set when the excerpt was
-- verified to actually appear in the notes -- never a fabricated citation.
-- Nullable and additive; existing rows/readers are unaffected.
--
-- Safe to run multiple times.

alter table if exists public.questions
  add column if not exists source_excerpt text;
