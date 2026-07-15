-- Standardized-test diagnostic center (Digital SAT, Phase 1) + connected
-- study-plan system (multi-month exam prep and short-term post-battle
-- plans). New tables only -- nothing here touches decks/questions/matches/
-- match_answers/profiles/generation_logs/membership_plans.
--
-- Design choices carried over from this repo's existing migrations
-- (mistake_breakdowns, topic_review_schedule, question_review_schedule,
-- resource_search_cache):
--   * uuid pk default gen_random_uuid(), timestamptz timestamps, `if not
--     exists`/`if exists` everywhere so this is safe to run multiple times.
--   * Enum-shaped fields use `text ... check (... in (...))`, exactly like
--     mistake_breakdowns.confidence_rating and challenge_notifications.event_type.
--   * domain/skill/task_type are intentionally left as free text (not a
--     check constraint) because they vary per exam and per plan type and
--     must stay editable without a migration -- exam_definitions.configuration
--     is the source of truth for the allowed set per exam (per the "keep exam
--     specs in config" requirement), matching how generation_cache already
--     keeps its shape loose (topic_focus, grade_level are free text too).
--   * Every table a student's browser can reach directly gets RLS with an
--     owner-only (or public-read-by-design) select policy and NO
--     anon/authenticated write policy -- every write goes through a
--     service-role API route, the same pattern this repo already uses for
--     matches/match_answers/mistake_breakdowns (see
--     20260711_core_tables_rls_hardening.sql). This is not optional here:
--     diagnostic_questions carries correct_answer/explanation, and the
--     product spec requires "do not reveal correctness during the
--     diagnostic" -- a client-writable or client-answer-readable table would
--     defeat that outright.
--
-- Safe to run multiple times.

-- ============================================================
-- exam_definitions
-- ============================================================

create table if not exists public.exam_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  provider text not null,
  status text not null default 'coming_soon'
    check (status in ('available', 'coming_soon', 'disabled')),
  disclaimer text not null,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_exam_definitions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_exam_definitions_updated_at on public.exam_definitions;
create trigger trg_exam_definitions_updated_at
before update on public.exam_definitions
for each row
execute function public.set_exam_definitions_updated_at();

alter table public.exam_definitions enable row level security;

-- Public reference data -- the diagnostics landing page needs every exam's
-- name/status/disclaimer (including "coming soon" ones) to render its cards.
drop policy if exists "exam_definitions_read" on public.exam_definitions;
create policy "exam_definitions_read"
  on public.exam_definitions
  for select
  to anon, authenticated
  using (true);

-- No anon/authenticated write policy -- publishing/editing exam config is an
-- admin-only action performed through a service-role API route (same
-- ADMIN_EMAILS-gated pattern as app/api/admin/stats), never a direct client
-- write.

-- Seed Phase 1 (Digital SAT) plus the "coming soon" cards named in the spec.
-- configuration holds the current public Digital SAT structure so timing/
-- counts can be corrected later without a code deploy if College Board
-- changes the format.
insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values (
  'digital-sat',
  'Digital SAT',
  'College Board',
  'available',
  'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.',
  '{
    "sections": [
      {
        "key": "reading_writing",
        "label": "Reading and Writing",
        "totalQuestions": 54,
        "totalMinutes": 64,
        "modules": [
          {"module": 1, "questions": 27, "minutes": 32},
          {"module": 2, "questions": 27, "minutes": 32}
        ]
      },
      {
        "key": "math",
        "label": "Math",
        "totalQuestions": 44,
        "totalMinutes": 70,
        "modules": [
          {"module": 1, "questions": 22, "minutes": 35},
          {"module": 2, "questions": 22, "minutes": 35}
        ]
      }
    ],
    "breakMinutesBetweenSections": 10,
    "modes": {
      "quick": {"targetMinutes": [35, 45], "label": "Quick Diagnostic"},
      "full": {"targetMinutes": 134, "label": "Full Diagnostic"}
    },
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "Transparent internal threshold, not a reproduction of College Board's proprietary adaptive algorithm."
    },
    "scoreRange": {"min": 400, "max": 1600, "sectionMin": 200, "sectionMax": 800}
  }'::jsonb
)
on conflict (slug) do nothing;

insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values
  ('psat-nmsqt', 'PSAT/NMSQT', 'College Board', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb),
  ('act', 'ACT', 'ACT, Inc.', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb),
  ('lsat', 'LSAT', 'LSAC', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb),
  ('mcat', 'MCAT', 'AAMC', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb),
  ('gre', 'GRE', 'ETS', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb),
  ('ap-exams', 'AP Exams', 'College Board', 'coming_soon', 'This is an unofficial StudyClash diagnostic and is not affiliated with or endorsed by College Board, LSAC, AAMC, ACT, or other testing organizations.', '{}'::jsonb)
on conflict (slug) do nothing;

-- ============================================================
-- diagnostic_questions (validated question bank)
-- ============================================================

create table if not exists public.diagnostic_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_definitions(id) on delete cascade,
  section text not null,
  domain text not null,
  skill text not null,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  question_type text not null
    check (question_type in ('multiple_choice', 'student_produced_response')),
  stimulus text,
  question_text text not null,
  answer_choices jsonb,
  correct_answer text not null,
  explanation text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'rejected', 'archived')),
  source_type text not null default 'ai_generated'
    check (source_type in ('ai_generated', 'human_authored')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diagnostic_questions_mc_has_choices check (
    question_type <> 'multiple_choice' or answer_choices is not null
  ),
  constraint diagnostic_questions_has_explanation check (
    length(trim(explanation)) > 0
  )
);

create or replace function public.set_diagnostic_questions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_diagnostic_questions_updated_at on public.diagnostic_questions;
create trigger trg_diagnostic_questions_updated_at
before update on public.diagnostic_questions
for each row
execute function public.set_diagnostic_questions_updated_at();

-- Bank-selection lookup: exam + section + domain/skill + difficulty,
-- restricted to published rows only (the shape every diagnostic-start and
-- adaptive module-2 query filters on).
create index if not exists idx_diagnostic_questions_bank_lookup
  on public.diagnostic_questions (exam_id, section, difficulty, status)
  where status = 'published';

create index if not exists idx_diagnostic_questions_skill
  on public.diagnostic_questions (exam_id, skill, status)
  where status = 'published';

-- Admin review queue.
create index if not exists idx_diagnostic_questions_review_queue
  on public.diagnostic_questions (status, created_at)
  where status = 'in_review';

-- Exact-duplicate guard within an exam. Near-duplicate detection (paraphrases)
-- is an app-layer concern handled in the admin review workflow, the same way
-- generation_cache's source_vector similarity check is app-layer, not a DB
-- constraint (20260709_generation_cache_vectors.sql).
create unique index if not exists diagnostic_questions_exam_text_unique
  on public.diagnostic_questions (exam_id, md5(question_text));

alter table public.diagnostic_questions enable row level security;

-- Intentionally NO anon/authenticated select or write policy. This table
-- holds correct_answer/explanation and unpublished draft content -- a
-- client-readable policy (even "published rows only") would let a student
-- read every answer key via a raw REST call before or during an attempt,
-- which directly violates "do not reveal correctness during the
-- diagnostic." All reads happen through service-role API routes that strip
-- correct_answer/explanation until the attempt is complete. All writes
-- (draft creation, review, publish) happen through the admin API route,
-- gated the same way app/api/admin/stats already gates admin access
-- (ADMIN_EMAILS env var checked server-side).

-- ============================================================
-- diagnostic_attempts
-- ============================================================

create table if not exists public.diagnostic_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exam_definitions(id) on delete cascade,
  mode text not null check (mode in ('quick', 'full')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'module_break', 'completed', 'abandoned', 'expired')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  current_section text,
  current_module integer,
  adaptive_path jsonb not null default '{}'::jsonb,
  estimated_score_low integer,
  estimated_score_high integer,
  created_at timestamptz not null default now(),
  -- Not in the original field list, but every other in-place-mutated table
  -- in this migration has one, and this row is rewritten on every module
  -- transition/autosave -- resume logic needs to know when it was last
  -- touched, same reasoning as diagnostic_responses.updated_at below.
  updated_at timestamptz not null default now()
);

create or replace function public.set_diagnostic_attempts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_diagnostic_attempts_updated_at on public.diagnostic_attempts;
create trigger trg_diagnostic_attempts_updated_at
before update on public.diagnostic_attempts
for each row
execute function public.set_diagnostic_attempts_updated_at();

create index if not exists idx_diagnostic_attempts_user_created
  on public.diagnostic_attempts (user_id, created_at desc);

-- Enforces "prevent duplicate attempts" at the DB level: a user can only
-- have one in-progress attempt per (exam, mode) at a time. The start route
-- checks for and resumes an existing one before ever attempting an insert
-- that would violate this.
create unique index if not exists diagnostic_attempts_one_in_progress_per_exam_mode
  on public.diagnostic_attempts (user_id, exam_id, mode)
  where status = 'in_progress';

alter table public.diagnostic_attempts enable row level security;

drop policy if exists "diagnostic_attempts_owner_read" on public.diagnostic_attempts;
create policy "diagnostic_attempts_owner_read"
  on public.diagnostic_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

-- No client insert/update policy. Starting, autosaving progress through,
-- and completing an attempt all require server-validated logic (duplicate
-- prevention, timing enforcement, score computation from validated
-- responses) -- the same reason matches/match_answers are insert-only via
-- /api/battle/finish rather than direct client writes.

-- ============================================================
-- diagnostic_responses
-- ============================================================

create table if not exists public.diagnostic_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.diagnostic_attempts(id) on delete cascade,
  question_id uuid not null references public.diagnostic_questions(id) on delete cascade,
  selected_answer text,
  is_correct boolean,
  response_time_seconds integer,
  flagged boolean not null default false,
  section text not null,
  module integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per (attempt, question); autosave upserts this row every time
  -- the student changes an answer or flag instead of inserting duplicates.
  unique (attempt_id, question_id)
);

create or replace function public.set_diagnostic_responses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_diagnostic_responses_updated_at on public.diagnostic_responses;
create trigger trg_diagnostic_responses_updated_at
before update on public.diagnostic_responses
for each row
execute function public.set_diagnostic_responses_updated_at();

create index if not exists idx_diagnostic_responses_attempt
  on public.diagnostic_responses (attempt_id, section, module);

alter table public.diagnostic_responses enable row level security;

drop policy if exists "diagnostic_responses_owner_read" on public.diagnostic_responses;
create policy "diagnostic_responses_owner_read"
  on public.diagnostic_responses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.diagnostic_attempts a
      where a.id = diagnostic_responses.attempt_id
        and a.user_id = auth.uid()
    )
  );

-- No client write policy -- autosave goes through a service-role route so
-- is_correct can be computed server-side (never trust/leak it from the
-- client) and so per-module timing/ownership can be validated the same way
-- /api/battle/finish validates match_answers.

-- ============================================================
-- diagnostic_results
-- ============================================================

create table if not exists public.diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.diagnostic_attempts(id) on delete cascade unique,
  overall_accuracy numeric,
  section_results jsonb not null default '{}'::jsonb,
  domain_results jsonb not null default '{}'::jsonb,
  skill_results jsonb not null default '{}'::jsonb,
  pacing_results jsonb not null default '{}'::jsonb,
  strongest_skills jsonb not null default '[]'::jsonb,
  weakest_skills jsonb not null default '[]'::jsonb,
  estimated_score_low integer,
  estimated_score_high integer,
  created_at timestamptz not null default now()
);

alter table public.diagnostic_results enable row level security;

drop policy if exists "diagnostic_results_owner_read" on public.diagnostic_results;
create policy "diagnostic_results_owner_read"
  on public.diagnostic_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.diagnostic_attempts a
      where a.id = diagnostic_results.attempt_id
        and a.user_id = auth.uid()
    )
  );

-- No client write policy -- written once, server-side, by the same
-- /complete route that closes out the attempt.

-- ============================================================
-- study_plans
-- ============================================================

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('diagnostic', 'battle_assessment')),
  diagnostic_attempt_id uuid references public.diagnostic_attempts(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  title text not null,
  exam_type text,
  assessment_type text
    check (assessment_type is null or assessment_type in (
      'quiz', 'unit_test', 'midterm', 'final_exam', 'assignment',
      'presentation', 'standardized_test'
    )),
  assessment_name text,
  assessment_date date not null,
  target_score text,
  minutes_per_day integer not null,
  available_days jsonb not null default '[]'::jsonb,
  weak_topics jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plans_source_reference check (
    (source_type = 'diagnostic' and diagnostic_attempt_id is not null)
    or (source_type = 'battle_assessment' and match_id is not null)
  )
);

create or replace function public.set_study_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_study_plans_updated_at on public.study_plans;
create trigger trg_study_plans_updated_at
before update on public.study_plans
for each row
execute function public.set_study_plans_updated_at();

create index if not exists idx_study_plans_user_status
  on public.study_plans (user_id, status, assessment_date);

-- Prevents duplicate plan generation from the same source (Part 7 #8) --
-- one active plan per diagnostic attempt / per triggering match.
create unique index if not exists study_plans_one_active_per_diagnostic
  on public.study_plans (diagnostic_attempt_id)
  where status = 'active' and diagnostic_attempt_id is not null;

create unique index if not exists study_plans_one_active_per_match
  on public.study_plans (match_id)
  where status = 'active' and match_id is not null;

alter table public.study_plans enable row level security;

drop policy if exists "study_plans_owner_read" on public.study_plans;
create policy "study_plans_owner_read"
  on public.study_plans
  for select
  to authenticated
  using (user_id = auth.uid());

-- Plan creation stays service-role-only (goes through /api/study-plans/generate,
-- which owns caching + the one-active-plan-per-source uniqueness above and
-- may call OpenAI to phrase/organize tasks -- never something to trigger
-- twice by racing a direct client insert).
--
-- Editing (title/status/target_score/minutes_per_day/available_days) is
-- allowed directly from the client, scoped to the owner -- same tradeoff
-- already accepted for profiles.plan in 20260711_core_tables_rls_hardening.sql
-- (RLS can restrict rows, not individual columns; the UI is trusted to only
-- ever send the editable fields). "Delete" is modeled as status='archived'
-- via this same policy, not a real DELETE -- matches this repo's general
-- avoidance of client-issued deletes.
drop policy if exists "study_plans_owner_update" on public.study_plans;
create policy "study_plans_owner_update"
  on public.study_plans
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- study_plan_tasks
-- ============================================================

create table if not exists public.study_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.study_plans(id) on delete cascade,
  scheduled_date date not null,
  topic text not null,
  -- Free text, not a check constraint: long-term SAT plans use phase-shaped
  -- values (foundation/skill_building/test_application/final_review) while
  -- short-term post-battle plans use concept_review/targeted_practice/
  -- spaced_review/mixed_practice/deck_replay/rest/catch_up -- both vocabularies
  -- are product content that needs to stay editable without a migration.
  task_type text not null,
  title text not null,
  description text not null,
  estimated_minutes integer not null,
  resource_links jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint study_plan_tasks_completed_at_consistent check (
    (completed = false and completed_at is null)
    or (completed = true and completed_at is not null)
  )
);

create index if not exists idx_study_plan_tasks_plan_date
  on public.study_plan_tasks (study_plan_id, scheduled_date);

create index if not exists idx_study_plan_tasks_plan_open
  on public.study_plan_tasks (study_plan_id, completed, scheduled_date)
  where completed = false;

alter table public.study_plan_tasks enable row level security;

drop policy if exists "study_plan_tasks_owner_read" on public.study_plan_tasks;
create policy "study_plan_tasks_owner_read"
  on public.study_plan_tasks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.study_plans p
      where p.id = study_plan_tasks.study_plan_id
        and p.user_id = auth.uid()
    )
  );

-- Mark-complete and single-task reschedule are allowed directly from the
-- client (owner-scoped) for a snappy checkbox UX -- the same precedent as
-- challenge_notifications' client-writable is_read toggle
-- (20260709_growth_foundations.sql). Bulk rebalancing of missed tasks across
-- multiple rows/days is NOT done this way -- that logic lives in
-- /api/study-plans/[planId]/rebalance (service-role), since "don't overload
-- one day with all missed work" requires reasoning across every open task at
-- once, not a single-row update.
drop policy if exists "study_plan_tasks_owner_update" on public.study_plan_tasks;
create policy "study_plan_tasks_owner_update"
  on public.study_plan_tasks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.study_plans p
      where p.id = study_plan_tasks.study_plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.study_plans p
      where p.id = study_plan_tasks.study_plan_id
        and p.user_id = auth.uid()
    )
  );

-- Task rows themselves are only ever bulk-inserted by the generation/
-- rebalance routes (service-role), never by the client.
