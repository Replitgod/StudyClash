-- Fills the highest-value gaps identified against the "Remaining Exam
-- Diagnostics System" spec: persisted cross-attempt mastery (today
-- diagnostic_results.weakest_skills/strongest_skills are a snapshot on a
-- single attempt row -- nothing aggregates them over time), a weak-area
-- retest mode, curriculum-mapping fields on the question bank, and richer
-- results-dashboard fields (difficulty breakdown, confidence, common
-- mistakes, readiness, cached AI analysis).
--
-- Safe to run multiple times.

-- ============================================================
-- diagnostic_questions: curriculum mapping fields
-- ============================================================
-- Nullable/additive -- every existing published question (108 rows) stays
-- valid with these unset; the admin authoring UI can start filling them in
-- without a backfill migration.

alter table public.diagnostic_questions
  add column if not exists concept_label text,
  add column if not exists curriculum_standard text,
  add column if not exists source_reference text;

-- ============================================================
-- diagnostic_attempts: weak-area retest mode
-- ============================================================
-- A student's highest-leverage re-entry point after a diagnostic: retest
-- ONLY the skills flagged weak, instead of a fresh full/quick attempt. Kept
-- as a genuinely separate mode (not a full/quick variant) because it has no
-- section/module structure, no adaptive Module 2 routing, and produces no
-- new exam score estimate -- it's a targeted mastery check, not a new
-- diagnostic. target_skills records which skills this attempt was built to
-- retest, so the attempt-taking UI and history page can label it.

alter table public.diagnostic_attempts
  drop constraint if exists diagnostic_attempts_mode_check;
alter table public.diagnostic_attempts
  add constraint diagnostic_attempts_mode_check check (mode in ('quick', 'full', 'weak_area'));

alter table public.diagnostic_attempts
  add column if not exists target_skills jsonb not null default '[]'::jsonb;

-- ============================================================
-- diagnostic_results: richer results-dashboard fields
-- ============================================================

alter table public.diagnostic_results
  add column if not exists difficulty_results jsonb not null default '{}'::jsonb,
  add column if not exists confidence_score numeric check (confidence_score between 0 and 100),
  add column if not exists common_mistakes jsonb not null default '[]'::jsonb,
  add column if not exists readiness_score numeric check (readiness_score between 0 and 100),
  add column if not exists readiness_tier text,
  -- Generated on first view of the results page (an OpenAI call), then
  -- cached here so revisiting results never re-generates it -- same
  -- "compute once, cache in the row" pattern as estimated_score_low/high.
  add column if not exists ai_analysis jsonb;

-- ============================================================
-- diagnostic_skill_mastery: persisted per-user, per-skill mastery
-- ============================================================
-- The table that was missing entirely: diagnostic_results snapshots one
-- attempt, but nothing aggregated "this student is weak in X" ACROSS
-- attempts. This is what the weak-area retest mode reads from, what the
-- history/analytics page charts over time, and what a future study-plan
-- auto-update-on-mastery-change pass would read. mastery_score is an
-- all-time Laplace-smoothed accuracy (correct+1)/(total+2)*100, same
-- smoothing rationale already used for strongest/weakest-skill ranking in
-- computeDiagnosticResults -- one lucky guess or one careless slip should
-- not swing a persisted score.

create table if not exists public.diagnostic_skill_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exam_definitions(id) on delete cascade,
  section text not null,
  domain text not null,
  skill text not null,
  mastery_score numeric not null default 0 check (mastery_score between 0 and 100),
  -- Mirrors lib/masteryTiers.ts's MIN_ATTEMPTS_FOR_HIGH_TIER guard --
  -- flips to false once attempts_count clears that threshold for this skill.
  is_estimate boolean not null default true,
  attempts_count integer not null default 0,
  correct_count integer not null default 0,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, exam_id, skill)
);

create or replace function public.set_diagnostic_skill_mastery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_diagnostic_skill_mastery_updated_at on public.diagnostic_skill_mastery;
create trigger trg_diagnostic_skill_mastery_updated_at
before update on public.diagnostic_skill_mastery
for each row execute function public.set_diagnostic_skill_mastery_updated_at();

create index if not exists idx_diagnostic_skill_mastery_user_exam
  on public.diagnostic_skill_mastery (user_id, exam_id, mastery_score);

alter table public.diagnostic_skill_mastery enable row level security;

drop policy if exists "diagnostic_skill_mastery_owner_read" on public.diagnostic_skill_mastery;
create policy "diagnostic_skill_mastery_owner_read"
  on public.diagnostic_skill_mastery
  for select
  to authenticated
  using (user_id = auth.uid());

-- No client write policy -- written only by finalizeAttempt (service role),
-- same reasoning as every other server-computed mastery signal in this repo.
