-- Structural prerequisite graph for diagnostic exam skills -- the piece
-- that was missing to make app/api/diagnostics/attempt/[attemptId]/
-- ai-analysis/route.ts's "prerequisite gap" language a real graph lookup
-- instead of an LLM guessing from accuracy statistics alone.
--
-- Deliberately a SEPARATE table from concept_relationships, not a reuse of
-- it: concept_relationships is scoped to concepts.id, which belongs to a
-- specific student's uploaded course (personal, emergent, built by the
-- curriculum-engine's AI concept-mapping pipeline from whatever that
-- student uploaded). Diagnostic skills are the opposite -- a small, fixed,
-- shared taxonomy per exam (the same ~18 skills for every Digital SAT
-- taker), authored here rather than extracted. There is no natural join
-- between "a concept extracted from one student's chemistry notes" and
-- "a skill in the shared SAT Math skill list" -- forcing them into one
-- table would misrepresent one as a special case of the other when they
-- have fundamentally different provenance.
--
-- Provenance and honesty note (see the design brief's own "never claim
-- certainty when evidence is weak" rule): the seed rows below are
-- hand-authored from standard, widely-agreed math/ELA pedagogical
-- sequencing (the kind any algebra textbook or reading-curriculum scope-
-- and-sequence would agree on), NOT extracted from an official College
-- Board curriculum framework document. confidence and notes make that
-- provenance visible per-row rather than presenting every edge as
-- equally certain. This is a reviewable starting point for the Digital
-- SAT skill list actually seeded in diagnostic_questions today
-- (supabase/migrations/20260715_diagnostic_question_seed.sql and its
-- follow-ups), not a claim of completeness or authority.
--
-- Safe to run multiple times.

create table if not exists public.diagnostic_skill_relationships (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_definitions(id) on delete cascade,
  section text not null,
  domain text not null,
  skill text not null,
  related_section text not null,
  related_domain text not null,
  related_skill text not null,
  relationship_type text not null
    check (relationship_type in ('prerequisite', 'related', 'builds_on', 'contrasts_with')),
  -- 0-1. Reflects how confident the hand-authored seed is in this specific
  -- edge, not a statistical measure -- see the provenance note above.
  confidence numeric not null default 0.7 check (confidence between 0 and 1),
  notes text,
  created_at timestamptz not null default now(),
  check (
    not (skill = related_skill and domain = related_domain and section = related_section)
  ),
  unique (exam_id, section, domain, skill, related_section, related_domain, related_skill, relationship_type)
);

create index if not exists idx_diagnostic_skill_relationships_lookup
  on public.diagnostic_skill_relationships (exam_id, section, domain, skill);

alter table public.diagnostic_skill_relationships enable row level security;

-- Public reference data, same reasoning as exam_definitions_read -- this is
-- curriculum metadata (skill names + relationship type), not student data,
-- and the diagnostics results/history UI needs to read it directly.
drop policy if exists "diagnostic_skill_relationships_read" on public.diagnostic_skill_relationships;
create policy "diagnostic_skill_relationships_read"
  on public.diagnostic_skill_relationships
  for select
  to anon, authenticated
  using (true);

-- No anon/authenticated write policy -- curated content, service-role only.

-- ============================================================
-- Seed: Digital SAT (the only 'available' exam today)
-- ============================================================
-- Skills below match exactly what's seeded in diagnostic_questions
-- (20260715_diagnostic_question_seed.sql and its 07-16/07-17/07-18
-- follow-ups) -- verified against that seed data before writing this,
-- specifically so no edge here references a skill that doesn't actually
-- exist in the question bank.

do $$
declare
  v_exam_id uuid;
begin
  select id into v_exam_id from public.exam_definitions where slug = 'digital-sat';

  if v_exam_id is not null then
    insert into public.diagnostic_skill_relationships
      (exam_id, section, domain, skill, related_section, related_domain, related_skill, relationship_type, confidence, notes)
    values
      -- Math: Algebra is the foundational domain everything else in Math
      -- builds on -- this is the least controversial part of the graph.
      (v_exam_id, 'math', 'Algebra', 'Linear equations', 'math', 'Algebra', 'Systems', 'prerequisite', 0.9,
        'Solving a system of linear equations requires solving a single linear equation first.'),
      (v_exam_id, 'math', 'Algebra', 'Linear equations', 'math', 'Advanced Math', 'Functions', 'prerequisite', 0.75,
        'Function notation and behavior is typically introduced via linear functions, which requires linear-equation fluency first.'),
      (v_exam_id, 'math', 'Algebra', 'Linear equations', 'math', 'Advanced Math', 'Quadratics', 'prerequisite', 0.7,
        'Quadratic equation-solving builds on general equation-solving skills first developed with linear equations.'),
      (v_exam_id, 'math', 'Advanced Math', 'Exponents', 'math', 'Advanced Math', 'Quadratics', 'prerequisite', 0.75,
        'Factoring and the quadratic formula both depend on exponent rules (squares, roots).'),
      (v_exam_id, 'math', 'Advanced Math', 'Functions', 'math', 'Advanced Math', 'Quadratics', 'builds_on', 0.7,
        'Quadratics are commonly taught as a specific function family, after general function concepts.'),
      (v_exam_id, 'math', 'Problem-Solving and Data Analysis', 'Ratios', 'math', 'Problem-Solving and Data Analysis', 'Percentages', 'prerequisite', 0.85,
        'A percentage is a specific type of ratio (per hundred) -- standard sequencing teaches ratios/proportional reasoning first.'),
      (v_exam_id, 'math', 'Problem-Solving and Data Analysis', 'Ratios', 'math', 'Problem-Solving and Data Analysis', 'Statistics', 'builds_on', 0.6,
        'Many data-analysis problems (proportions within a data set, relative frequency) lean on ratio reasoning.'),
      (v_exam_id, 'math', 'Problem-Solving and Data Analysis', 'Percentages', 'math', 'Problem-Solving and Data Analysis', 'Statistics', 'related', 0.5,
        'Percentages appear frequently within data-analysis/statistics problems, but are not a strict prerequisite.'),
      (v_exam_id, 'math', 'Geometry and Trigonometry', 'Triangles', 'math', 'Geometry and Trigonometry', 'Circles', 'related', 0.4,
        'Some circle problems (inscribed angles, chords) use triangle properties, but the two are largely independent topics in most curricula -- kept as "related," not "prerequisite," intentionally.'),

      -- Reading & Writing: word-level and central-idea understanding
      -- underpin most of the higher-order Information and Ideas skills.
      (v_exam_id, 'reading_writing', 'Craft and Structure', 'Words in context', 'reading_writing', 'Information and Ideas', 'Central ideas', 'prerequisite', 0.7,
        'Identifying a central idea depends on correctly understanding the words that convey it in context.'),
      (v_exam_id, 'reading_writing', 'Craft and Structure', 'Words in context', 'reading_writing', 'Information and Ideas', 'Inferences', 'prerequisite', 0.7,
        'Inference questions frequently hinge on precise word-in-context meaning.'),
      (v_exam_id, 'reading_writing', 'Information and Ideas', 'Central ideas', 'reading_writing', 'Information and Ideas', 'Evidence', 'prerequisite', 0.75,
        'Selecting evidence for a claim requires first correctly identifying what the claim/central idea is.'),
      (v_exam_id, 'reading_writing', 'Information and Ideas', 'Central ideas', 'reading_writing', 'Information and Ideas', 'Inferences', 'builds_on', 0.65,
        'Drawing a sound inference usually builds on having identified the passage''s central idea correctly.'),
      (v_exam_id, 'reading_writing', 'Craft and Structure', 'Text structure and purpose', 'reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'prerequisite', 0.65,
        'Synthesizing multiple sources for a rhetorical purpose requires first understanding each source''s own structure and purpose.'),
      (v_exam_id, 'reading_writing', 'Expression of Ideas', 'Transitions', 'reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'related', 0.45,
        'Both are "Expression of Ideas" skills involving how ideas connect, but are not strictly sequential.'),
      (v_exam_id, 'reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'reading_writing', 'Standard English Conventions', 'Boundaries', 'related', 0.4,
        'Sentence-level grammar/sense and punctuation-boundary rules are parallel grammar sub-skills, not a strict pedagogical sequence -- kept as "related," not "prerequisite," intentionally.')
    on conflict (exam_id, section, domain, skill, related_section, related_domain, related_skill, relationship_type) do nothing;
  end if;
end $$;
