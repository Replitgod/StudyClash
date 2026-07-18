-- find_similar_curriculum_questions: deterministic near-duplicate detection
-- for the question_verification pipeline's "duplicate_detection" stage
-- (Section 8). curriculum_questions_course_text_unique (see
-- 20260725_curriculum_engine_schema_phase1.sql) already blocks an EXACT
-- re-insert at the DB level -- this function catches paraphrases, which a
-- plain unique index can't. Uses pg_trgm's similarity() (extension already
-- enabled in the phase-1 migration for content_chunks' trigram index)
-- rather than standing up a second embedding pipeline just for this one
-- check -- "use deterministic validation tools where possible" (Section 8),
-- and trigram similarity on question text is deterministic, cheap, and
-- needs no OpenAI call.
--
-- Safe to run multiple times.

create or replace function public.find_similar_curriculum_questions(
  p_course_id uuid,
  p_concept_id uuid,
  p_question_text text,
  p_exclude_question_id uuid default null,
  p_threshold real default 0.55,
  p_limit int default 5
)
returns table (
  question_id uuid,
  question_text text,
  similarity real
)
language sql
stable
as $$
  select
    q.id as question_id,
    q.question_text,
    similarity(q.question_text, p_question_text) as similarity
  from public.curriculum_questions q
  where q.course_id = p_course_id
    and (p_concept_id is null or q.concept_id = p_concept_id)
    and q.status in ('approved', 'pending_verification')
    and (p_exclude_question_id is null or q.id <> p_exclude_question_id)
    and similarity(q.question_text, p_question_text) >= p_threshold
  order by similarity desc
  limit p_limit;
$$;
