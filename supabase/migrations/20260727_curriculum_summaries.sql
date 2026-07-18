-- content_summaries: storage for Section 3's hierarchical summaries. Not
-- in the original Section 16 table list (curricula/courses/.../study_plan_tasks
-- never names a summaries table anywhere), even though Section 3 explicitly
-- requires "store summaries separately." Adding it now rather than
-- silently having nowhere to put this stage's output.
--
-- Hierarchy is modeled as a self-referencing parent_summary_id rather than
-- one column per level -- chunk summaries roll up into section summaries,
-- section into chapter, chapter into course. "Unit" is deliberately absent
-- from summary_level for now: units only exist once Section 5's concept
-- hierarchy (concepts.concept_level = 'unit') has real rows to group
-- chapters by, which this migration doesn't build. Revisit once Section 5
-- ships.
--
-- Safe to run multiple times.

create table if not exists public.content_summaries (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  summary_level text not null check (summary_level in ('chunk', 'section', 'chapter', 'course')),
  parent_summary_id uuid references public.content_summaries(id) on delete cascade,
  source_chunk_ids uuid[] not null default '{}',
  title text,
  summary_text text not null,
  -- Section 3: "every summary must preserve" these categories -- kept as
  -- structured jsonb arrays (not just folded into summary_text prose) so
  -- later stages can reuse them directly, e.g. vocabulary feeding
  -- flashcard-style content, misconceptions feeding distractor generation
  -- in Section 7's question generator.
  key_facts jsonb not null default '[]'::jsonb,
  definitions jsonb not null default '[]'::jsonb,
  formulas jsonb not null default '[]'::jsonb,
  procedures jsonb not null default '[]'::jsonb,
  dates jsonb not null default '[]'::jsonb,
  vocabulary jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  misconceptions jsonb not null default '[]'::jsonb,
  learning_objectives jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_content_summaries_updated_at on public.content_summaries;
create trigger trg_content_summaries_updated_at
before update on public.content_summaries
for each row execute function public.set_updated_at();

create index if not exists idx_content_summaries_course_level
  on public.content_summaries (course_id, summary_level);
create index if not exists idx_content_summaries_document
  on public.content_summaries (document_id, summary_level);
create index if not exists idx_content_summaries_parent
  on public.content_summaries (parent_summary_id);

alter table public.content_summaries enable row level security;

drop policy if exists "content_summaries_owner_read" on public.content_summaries;
create policy "content_summaries_owner_read"
  on public.content_summaries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = content_summaries.course_id and c.owner_id = auth.uid()
    )
  );

-- No client write policy -- summarization is a pipeline stage.
