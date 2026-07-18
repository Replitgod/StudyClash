-- coverage_plans + coverage_matrix_entries: Section 6's coverage matrix
-- storage. coverage_plans was named in the PDF's original Section 16 list
-- but wasn't part of the first DB migration you asked me to build (same
-- situation as content_summaries) -- and the matrix itself needs a
-- per-concept child table, which the spec never names at all. One
-- coverage_plans row per computed snapshot (not continuously mutated in
-- place) so coverage history over time is inspectable, with matrix entries
-- hanging off whichever snapshot is current.
--
-- Safe to run multiple times.

create table if not exists public.coverage_plans (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'computing' check (status in ('computing', 'ready', 'stale')),
  total_concepts integer not null default 0,
  concepts_covered integer not null default 0,
  overall_coverage_percent numeric,
  computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_coverage_plans_updated_at on public.coverage_plans;
create trigger trg_coverage_plans_updated_at
before update on public.coverage_plans
for each row execute function public.set_updated_at();

-- Only the most recent plan per course is "ready" at a time -- older ones
-- are marked 'stale' by the job rather than deleted, preserving history.
create index if not exists idx_coverage_plans_course_status
  on public.coverage_plans (course_id, status, computed_at desc);

alter table public.coverage_plans enable row level security;

drop policy if exists "coverage_plans_owner_read" on public.coverage_plans;
create policy "coverage_plans_owner_read"
  on public.coverage_plans
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = coverage_plans.course_id and c.owner_id = auth.uid()
    )
  );

create table if not exists public.coverage_matrix_entries (
  id uuid primary key default gen_random_uuid(),
  coverage_plan_id uuid not null references public.coverage_plans(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  source_page_count integer not null default 0,
  importance text,
  question_target integer not null default 0,
  approved_question_count integer not null default 0,
  coverage_status text not null default 'not_covered' check (coverage_status in (
    'not_covered', 'under_covered', 'covered', 'over_covered'
  )),
  needs_harder_questions boolean not null default false,
  created_at timestamptz not null default now(),
  unique (coverage_plan_id, concept_id)
);

create index if not exists idx_coverage_matrix_entries_plan
  on public.coverage_matrix_entries (coverage_plan_id, coverage_status);

alter table public.coverage_matrix_entries enable row level security;

drop policy if exists "coverage_matrix_entries_owner_read" on public.coverage_matrix_entries;
create policy "coverage_matrix_entries_owner_read"
  on public.coverage_matrix_entries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.coverage_plans p
      join public.courses c on c.id = p.course_id
      where p.id = coverage_matrix_entries.coverage_plan_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy on either table -- coverage is a computed
-- pipeline output.
