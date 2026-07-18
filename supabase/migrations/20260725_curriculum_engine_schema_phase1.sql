-- Universal Curriculum Intelligence Engine -- Phase 1/2 schema (Section 16
-- subset: processing_jobs/processing_job_steps, documents/document_pages/
-- content_chunks/chunk_embeddings, concepts/concept_relationships,
-- questions/question_sources/question_reviews, student_mastery/study_plans).
--
-- THREE DEVIATIONS FROM THE LITERAL SPEC, each load-bearing:
--
-- 1. RENAMED "questions" -> "curriculum_questions" and "study_plans" ->
--    "curriculum_study_plans". Both names collide with real, live,
--    differently-shaped tables already powering production features:
--    - public.questions: the deck/battle question bank (question_text,
--      answer_choices, correct_answer, deck_id, ...), read by every battle
--      and by app/api/generate-questions. Verified live columns via the
--      service-role client before writing this migration.
--    - public.study_plans + study_plan_tasks: the diagnostic/battle-driven
--      study plan system from 20260715_diagnostics_and_study_plans.sql,
--      wired to /api/study-plans/* and app/study-plans/[planId]. Also
--      verified live.
--    `create table if not exists` against either name would have silently
--    no-op'd against the WRONG schema rather than erroring -- worse than a
--    hard failure, since every insert from the new pipeline would then
--    fail on unrelated NOT NULL columns with a confusing error, or
--    (worse) partially succeed and corrupt whichever table won the race.
--    Unifying the curriculum-driven plan with the existing study_plans
--    system (one UI, one API, a third `source_type`) is a real product
--    decision -- not something to silently pick here. Flagging it now:
--    when you're ready to build the study-plan UI for course-based plans,
--    decide whether curriculum_study_plans stays separate or gets merged
--    into study_plans as a new source_type. question_sources/
--    question_reviews did NOT need renaming -- those names are free, and
--    their FK to curriculum_questions makes the relationship unambiguous
--    regardless of the parent table's name.
--
-- 2. ADDED a minimal "courses" table even though it wasn't in this
--    request's list. Every table below needs a course_id to scope to --
--    without it there is nothing for documents/concepts/curriculum_questions/
--    processing_jobs to reference, and an unconstrained bare uuid would be
--    weaker than what "production-ready" implies. This is intentionally
--    minimal (id, owner, name, subject) -- expect it to gain real columns
--    (curriculum standard links, versioning) when you get to the
--    curricula/courses/course_versions section of Section 16.
--
-- 3. "Mastery score" was listed under the spec's per-concept fields, but a
--    concept can't have one mastery score -- every student has their own.
--    That field lives on student_mastery (keyed by user+concept), not on
--    concepts itself, which is the correction actually implied by having a
--    separate student_mastery table at all.
--
-- Everything else follows this repo's established conventions: uuid pk
-- default gen_random_uuid(), timestamptz timestamps, `if not exists`/`if
-- exists` everywhere (safe to run multiple times), enum-shaped fields as
-- `text ... check (...)`, loosely-specified taxonomy fields (curriculum
-- standards, until the dedicated table exists) left as free text rather
-- than a premature FK -- same tradeoff already made for study_plans'
-- domain/skill/task_type. RLS: every table gets RLS enabled; tables
-- carrying answer keys or internal pipeline state get NO client
-- read/write policy at all (service-role only), matching
-- diagnostic_questions' precedent exactly. updated_at triggers use one
-- shared function (set_updated_at) rather than one function per table --
-- a small simplification given the number of tables here, not a
-- functional change from this repo's per-table-function precedent.
--
-- Safe to run multiple times.

create extension if not exists vector;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- courses (minimal -- see deviation #2 above)
-- ============================================================

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create index if not exists idx_courses_owner on public.courses (owner_id, status);

alter table public.courses enable row level security;

drop policy if exists "courses_owner_read" on public.courses;
create policy "courses_owner_read"
  on public.courses
  for select
  to authenticated
  using (owner_id = auth.uid());

-- Course creation is a lightweight, low-risk client action (unlike
-- ingestion/generation, which stay service-role-only below) -- same
-- tradeoff as profiles/study_plan_tasks allowing a scoped client write.
drop policy if exists "courses_owner_insert" on public.courses;
create policy "courses_owner_insert"
  on public.courses
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "courses_owner_update" on public.courses;
create policy "courses_owner_update"
  on public.courses
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- documents
-- ============================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  title text not null,
  source_type text not null check (source_type in (
    'pdf', 'scanned_pdf', 'word', 'powerpoint', 'image', 'text_file',
    'web_page', 'syllabus', 'textbook', 'teacher_notes', 'worksheet',
    'study_guide', 'practice_exam', 'research_paper', 'curriculum_document'
  )),
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  page_count integer,
  checksum text,
  duplicate_of_document_id uuid references public.documents(id) on delete set null,
  processing_status text not null default 'uploaded' check (processing_status in (
    'uploaded', 'extracting', 'chunking', 'indexing', 'mapping',
    'generating', 'verifying', 'ready', 'failed'
  )),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create index if not exists idx_documents_course_status
  on public.documents (course_id, processing_status);

-- Exact re-upload detection within a course (Section 1: "detect duplicate
-- files") -- scoped to course, not global, since the same textbook could
-- legitimately be uploaded to two different courses.
create unique index if not exists documents_course_checksum_unique
  on public.documents (course_id, checksum)
  where checksum is not null;

alter table public.documents enable row level security;

drop policy if exists "documents_owner_read" on public.documents;
create policy "documents_owner_read"
  on public.documents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = documents.course_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- upload registration, status transitions, and
-- reprocessing all go through service-role ingestion routes (the pipeline
-- itself owns processing_status, extraction_confidence, checksum
-- computation; a client-writable status field would let a student mark
-- their own unprocessed upload "ready").

-- ============================================================
-- document_pages
-- ============================================================

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  raw_text text,
  ocr_used boolean not null default false,
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  is_unreadable boolean not null default false,
  -- Detected headings/tables/diagrams/equations/page-number anchors for
  -- this page (Section 1, point 4) -- kept as jsonb rather than separate
  -- tables since its shape varies a lot per document type and is consumed
  -- as a unit by the chunker, never queried column-by-column.
  structure jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending' check (processing_status in (
    'pending', 'extracted', 'failed', 'needs_review'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_number)
);

drop trigger if exists trg_document_pages_updated_at on public.document_pages;
create trigger trg_document_pages_updated_at
before update on public.document_pages
for each row execute function public.set_updated_at();

create index if not exists idx_document_pages_document
  on public.document_pages (document_id, page_number);

-- Reprocessing queue lookup (Section 1, point 10: "allow failed pages to
-- be reprocessed").
create index if not exists idx_document_pages_needs_reprocessing
  on public.document_pages (document_id)
  where processing_status in ('failed', 'needs_review');

alter table public.document_pages enable row level security;

drop policy if exists "document_pages_owner_read" on public.document_pages;
create policy "document_pages_owner_read"
  on public.document_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      join public.courses c on c.id = d.course_id
      where d.id = document_pages.document_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- extraction-only, service-role.

-- ============================================================
-- content_chunks
-- ============================================================

create table if not exists public.content_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  page_start integer not null,
  page_end integer not null,
  chapter text,
  section text,
  heading text,
  topic text,
  subtopic text,
  chunk_type text not null default 'paragraph' check (chunk_type in (
    'chapter', 'section', 'heading', 'paragraph', 'learning_objective',
    'topic', 'table', 'diagram', 'equation'
  )),
  content text not null,
  -- Generated column, not maintained by the app -- keyword/exact-phrase
  -- search (Section 2) reads this directly via the GIN index below.
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  token_count integer,
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  constraint content_chunks_page_range check (page_end >= page_start),
  unique (document_id, chunk_index)
);

create index if not exists idx_content_chunks_course
  on public.content_chunks (course_id);
create index if not exists idx_content_chunks_document
  on public.content_chunks (document_id, page_start);
create index if not exists idx_content_chunks_topic
  on public.content_chunks (course_id, topic);

-- Hybrid retrieval, keyword half: GIN index over the generated tsvector
-- for full-text search, plus a trigram index for fuzzy/substring and
-- exact-phrase-adjacent lookups (chapter/section/heading/topic names).
create index if not exists idx_content_chunks_tsv
  on public.content_chunks using gin (content_tsv);
create index if not exists idx_content_chunks_content_trgm
  on public.content_chunks using gin (content gin_trgm_ops);

alter table public.content_chunks enable row level security;

drop policy if exists "content_chunks_owner_read" on public.content_chunks;
create policy "content_chunks_owner_read"
  on public.content_chunks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = content_chunks.course_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- chunking is a pipeline stage, service-role only.

-- ============================================================
-- chunk_embeddings
-- ============================================================
-- Kept as its own table (not a column on content_chunks) so re-embedding
-- with a new/different model never requires touching chunk content, and
-- so a chunk can eventually carry more than one embedding_model row.
--
-- vector(1536) matches OpenAI text-embedding-3-small's output dimension --
-- this is an assumption, not a hard requirement of the spec. If a
-- different embedding model/dimension gets picked, this column's
-- dimension must change with it (pgvector requires a fixed dimension per
-- column); revisit before Phase 2 ingestion actually runs.

create table if not exists public.chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.content_chunks(id) on delete cascade,
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (chunk_id, embedding_model)
);

-- Hybrid retrieval, semantic half: HNSW over cosine distance. HNSW chosen
-- over ivfflat -- no "train the index on N existing rows first" step,
-- which matters here since embeddings arrive incrementally per course
-- rather than in one bulk load.
create index if not exists idx_chunk_embeddings_hnsw
  on public.chunk_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.chunk_embeddings enable row level security;

drop policy if exists "chunk_embeddings_owner_read" on public.chunk_embeddings;
create policy "chunk_embeddings_owner_read"
  on public.chunk_embeddings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.content_chunks cc
      join public.courses c on c.id = cc.course_id
      where cc.id = chunk_embeddings.chunk_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- embeddings are written by the indexing job only.

-- ============================================================
-- processing_jobs
-- ============================================================
-- One row per pipeline stage run, either course-scoped (document_id null --
-- chunking/indexing/summarization/concept_mapping/coverage_planning/
-- question_generation/question_verification/course_publish all operate
-- across multiple documents at once) or document-scoped (document_ingestion,
-- which runs per uploaded file).

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  job_type text not null check (job_type in (
    'document_ingestion', 'chunking', 'indexing', 'summarization',
    'concept_mapping', 'coverage_planning', 'question_generation',
    'question_verification', 'course_publish'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  priority integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  -- Job input (e.g. which documents/chunks to operate on) and output
  -- (e.g. counts produced) -- kept generic since every job_type's
  -- input/output shape is different and none of it needs to be queried
  -- column-by-column, only read back by whatever enqueued/is watching it.
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_processing_jobs_updated_at on public.processing_jobs;
create trigger trg_processing_jobs_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

-- Worker dequeue query: oldest-first among queued jobs, respecting priority.
create index if not exists idx_processing_jobs_dequeue
  on public.processing_jobs (status, priority desc, scheduled_at)
  where status = 'queued';

create index if not exists idx_processing_jobs_course
  on public.processing_jobs (course_id, job_type, status);

-- "Avoid duplicate work" (Section 9): at most one active (queued/running)
-- job per (course, document, job_type) -- a resume/retry action should
-- reuse or requeue the existing row rather than the app being able to
-- accidentally double-enqueue the same stage.
create unique index if not exists processing_jobs_one_active_per_stage
  on public.processing_jobs (course_id, coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid), job_type)
  where status in ('queued', 'running');

alter table public.processing_jobs enable row level security;

-- Intentionally NO client read or write policy. Job payload/result/
-- last_error can carry raw extracted content and internal pipeline
-- details -- this is operational state, not user-facing data. The
-- student-facing progress numbers in Section 10 (pages processed, topics
-- detected, etc.) are a derived, server-computed summary exposed through
-- a dedicated API route, not a direct read of this table.

-- ============================================================
-- processing_job_steps
-- ============================================================
-- Granular execution log within a job -- e.g. a question_verification job
-- steps through source_grounding -> answer_verification ->
-- curriculum_alignment -> difficulty_classification -> duplicate_detection
-- -> ambiguity_check -> final_approval (Section 8's exact chain), each
-- recorded as its own row for debugging/audit rather than only keeping
-- the job's final status.

create table if not exists public.processing_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  step_name text not null,
  step_order integer not null,
  status text not null default 'pending' check (status in (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),
  attempt_count integer not null default 0,
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, step_order)
);

create index if not exists idx_processing_job_steps_job
  on public.processing_job_steps (job_id, step_order);

alter table public.processing_job_steps enable row level security;

-- Same reasoning as processing_jobs -- no client read/write policy.

-- ============================================================
-- concepts
-- ============================================================
-- Course -> Units -> Chapters -> Topics -> Concepts -> Skills -> Subskills
-- (Section 5) modeled as one self-referencing table with a level tag,
-- rather than seven separate tables -- the hierarchy depth/labels vary a
-- lot per subject (a language course's tree looks nothing like a
-- chemistry course's), and every level needs the same fields (name,
-- description, importance, difficulty, prerequisites via
-- concept_relationships, supporting pages). Learning/assessment
-- objectives are folded in as concept_level values too rather than
-- separate node types, since the spec's own graph diagram is already a
-- variable-depth chain, not a fixed 4-level tree.

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  parent_concept_id uuid references public.concepts(id) on delete set null,
  concept_level text not null default 'concept' check (concept_level in (
    'unit', 'chapter', 'topic', 'concept', 'skill', 'subskill',
    'learning_objective', 'assessment_objective'
  )),
  name text not null,
  description text,
  importance text check (importance in ('low', 'medium', 'high', 'critical')),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  common_mistakes jsonb not null default '[]'::jsonb,
  estimated_learning_minutes integer,
  -- Free text until the dedicated curriculum_standards table exists (not
  -- part of this request) -- same tradeoff as study_plans.domain/skill.
  curriculum_standard text,
  teacher_emphasis text,
  -- [{documentId, pageStart, pageEnd}, ...] -- denormalized for fast
  -- concept-page-jump reads (Section 10: "open any concept -> any source
  -- page"); question_sources remains the authoritative per-question trace.
  supporting_pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_concepts_updated_at on public.concepts;
create trigger trg_concepts_updated_at
before update on public.concepts
for each row execute function public.set_updated_at();

create index if not exists idx_concepts_course_level
  on public.concepts (course_id, concept_level);
create index if not exists idx_concepts_parent
  on public.concepts (parent_concept_id);

alter table public.concepts enable row level security;

drop policy if exists "concepts_owner_read" on public.concepts;
create policy "concepts_owner_read"
  on public.concepts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = concepts.course_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- concept mapping is a pipeline stage.

-- ============================================================
-- concept_relationships
-- ============================================================

create table if not exists public.concept_relationships (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  related_concept_id uuid not null references public.concepts(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'prerequisite', 'related', 'builds_on', 'contrasts_with'
  )),
  created_at timestamptz not null default now(),
  constraint concept_relationships_no_self_reference check (concept_id <> related_concept_id),
  unique (concept_id, related_concept_id, relationship_type)
);

create index if not exists idx_concept_relationships_concept
  on public.concept_relationships (concept_id, relationship_type);
create index if not exists idx_concept_relationships_related
  on public.concept_relationships (related_concept_id, relationship_type);

alter table public.concept_relationships enable row level security;

drop policy if exists "concept_relationships_owner_read" on public.concept_relationships;
create policy "concept_relationships_owner_read"
  on public.concept_relationships
  for select
  to authenticated
  using (
    exists (
      select 1 from public.concepts c1
      join public.courses co on co.id = c1.course_id
      where c1.id = concept_relationships.concept_id and co.owner_id = auth.uid()
    )
  );

-- No client write policy.

-- ============================================================
-- curriculum_questions ("questions" in the spec -- see deviation #1)
-- ============================================================

create table if not exists public.curriculum_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  question_text text not null,
  question_type text not null check (question_type in (
    'multiple_choice', 'fill_in_blank', 'short_answer', 'numeric_response',
    'multi_select', 'matching', 'ordering', 'diagram_labeling',
    'graph_interpretation', 'error_analysis', 'case_study', 'scenario',
    'application', 'essay_prompt', 'challenge'
  )),
  cognitive_level text not null default 'understanding' check (cognitive_level in (
    'recall', 'understanding', 'procedure', 'application', 'analysis',
    'multi_step_reasoning', 'exam_level_challenge'
  )),
  choices jsonb not null default '[]'::jsonb,
  correct_answer text,
  accepted_answers jsonb not null default '[]'::jsonb,
  explanation text not null,
  difficulty integer not null default 3 check (difficulty between 1 and 5),
  curriculum_standard text,
  estimated_time_seconds integer,
  common_mistake text,
  verification_score numeric check (verification_score between 0 and 1),
  status text not null default 'draft' check (status in (
    'draft', 'pending_verification', 'approved', 'rejected', 'needs_repair', 'archived'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_questions_has_explanation check (length(trim(explanation)) > 0)
);

drop trigger if exists trg_curriculum_questions_updated_at on public.curriculum_questions;
create trigger trg_curriculum_questions_updated_at
before update on public.curriculum_questions
for each row execute function public.set_updated_at();

-- Bank-selection lookup (mirrors diagnostic_questions_bank_lookup exactly).
create index if not exists idx_curriculum_questions_bank_lookup
  on public.curriculum_questions (course_id, concept_id, difficulty, status)
  where status = 'approved';

create index if not exists idx_curriculum_questions_review_queue
  on public.curriculum_questions (status, created_at)
  where status in ('draft', 'pending_verification', 'needs_repair');

-- Exact-duplicate guard within a course (near-duplicate/paraphrase
-- detection stays app-layer, same precedent as generation_cache and
-- diagnostic_questions).
create unique index if not exists curriculum_questions_course_text_unique
  on public.curriculum_questions (course_id, md5(question_text));

alter table public.curriculum_questions enable row level security;

-- Intentionally NO client read or write policy -- carries correct_answer/
-- explanation for potentially-unpublished (draft/pending_verification)
-- questions. Reads happen through a service-role route that strips
-- correct_answer/explanation the same way diagnostic attempts do.

-- ============================================================
-- question_sources
-- ============================================================
-- Traceability from a question back to the exact excerpt that supports it
-- (Section 15: never expose full pages, only a supporting excerpt +
-- reference) -- a question can cite more than one chunk, hence a separate
-- table rather than a single chunk_id column on curriculum_questions.

create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.curriculum_questions(id) on delete cascade,
  chunk_id uuid references public.content_chunks(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  page_start integer,
  page_end integer,
  supporting_excerpt text not null,
  created_at timestamptz not null default now(),
  constraint question_sources_excerpt_not_empty check (length(trim(supporting_excerpt)) > 0)
);

create index if not exists idx_question_sources_question
  on public.question_sources (question_id);
create index if not exists idx_question_sources_chunk
  on public.question_sources (chunk_id);

alter table public.question_sources enable row level security;

-- No client read/write policy -- same trust boundary as curriculum_questions
-- (a source excerpt could reveal enough to infer the answer).

-- ============================================================
-- question_reviews
-- ============================================================
-- One row per stage of the Section 8 validation chain: question generator
-- -> source-grounding verifier -> answer verifier -> curriculum alignment
-- checker -> difficulty classifier -> duplicate detector -> ambiguity
-- checker -> final approval.

create table if not exists public.question_reviews (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.curriculum_questions(id) on delete cascade,
  review_stage text not null check (review_stage in (
    'source_grounding', 'answer_verification', 'curriculum_alignment',
    'difficulty_classification', 'duplicate_detection', 'ambiguity_check',
    'final_approval'
  )),
  passed boolean not null,
  score numeric check (score between 0 and 1),
  -- "For mathematics, science, code, and other rule-based subjects, use
  -- deterministic validation tools where possible" (Section 8) -- this is
  -- why reviewer_type exists as its own field rather than assuming every
  -- review row came from an LLM call.
  reviewer_type text not null default 'ai' check (reviewer_type in ('ai', 'deterministic_tool', 'human')),
  reviewer_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_reviews_question
  on public.question_reviews (question_id, review_stage);

alter table public.question_reviews enable row level security;

-- No client read/write policy.

-- ============================================================
-- student_mastery
-- ============================================================

create table if not exists public.student_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  mastery_score numeric not null default 0 check (mastery_score between 0 and 100),
  -- "Clearly label early mastery scores as estimates until more evidence
  -- is collected" (Section 11) -- flips to false once attempts_count
  -- clears whatever minimum-sample threshold the mastery engine uses
  -- (mirrors the MIN_ATTEMPTS_FOR_HIGH_TIER guard already established in
  -- lib/masteryTiers.ts for the existing battle-driven mastery system).
  is_estimate boolean not null default true,
  attempts_count integer not null default 0,
  correct_count integer not null default 0,
  forgetting_risk numeric check (forgetting_risk between 0 and 1),
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, concept_id)
);

drop trigger if exists trg_student_mastery_updated_at on public.student_mastery;
create trigger trg_student_mastery_updated_at
before update on public.student_mastery
for each row execute function public.set_updated_at();

create index if not exists idx_student_mastery_user
  on public.student_mastery (user_id, mastery_score);

alter table public.student_mastery enable row level security;

drop policy if exists "student_mastery_owner_read" on public.student_mastery;
create policy "student_mastery_owner_read"
  on public.student_mastery
  for select
  to authenticated
  using (user_id = auth.uid());

-- No client write policy -- mastery is server-computed from verified
-- attempts, same reasoning as the existing battle/diagnostic mastery
-- signals never being client-writable.

-- ============================================================
-- curriculum_study_plans ("study_plans" in the spec -- see deviation #1)
-- ============================================================

create table if not exists public.curriculum_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  target_completion_date date,
  minutes_per_day integer,
  -- Generated task list. Kept inline as jsonb rather than a separate
  -- curriculum_study_plan_tasks table for now, since this table wasn't
  -- part of this request -- if per-task tracking (mark complete,
  -- reschedule) is needed later, decide then whether to add that table or
  -- extend the existing study_plan_tasks with a nullable
  -- curriculum_study_plan_id column instead of building a third parallel
  -- task system.
  plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_curriculum_study_plans_updated_at on public.curriculum_study_plans;
create trigger trg_curriculum_study_plans_updated_at
before update on public.curriculum_study_plans
for each row execute function public.set_updated_at();

create index if not exists idx_curriculum_study_plans_user_status
  on public.curriculum_study_plans (user_id, status);

-- One active plan per course, same "prevent duplicate generation" intent
-- as study_plans_one_active_per_diagnostic/per_match.
create unique index if not exists curriculum_study_plans_one_active_per_course
  on public.curriculum_study_plans (user_id, course_id)
  where status = 'active';

alter table public.curriculum_study_plans enable row level security;

drop policy if exists "curriculum_study_plans_owner_read" on public.curriculum_study_plans;
create policy "curriculum_study_plans_owner_read"
  on public.curriculum_study_plans
  for select
  to authenticated
  using (user_id = auth.uid());

-- Plan generation/regeneration stays service-role-only (owns the
-- one-active-plan-per-course uniqueness + may call OpenAI), matching
-- study_plans' exact precedent. No client insert/update policy for now --
-- unlike study_plans, there's no lightweight per-field edit surface
-- (title/minutes_per_day/etc.) requested yet; add one the same way if/when
-- the UI needs it.
