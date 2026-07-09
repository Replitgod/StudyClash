-- Public beta security hardening for core tables used by feedback and analytics.
-- Safe to run multiple times.

alter table if exists public.feedback_reports enable row level security;
alter table if exists public.question_reports enable row level security;
alter table if exists public.enterprise_leads enable row level security;
alter table if exists public.analytics_events enable row level security;

-- Feedback reports: allow inserts, keep reads locked down by default.
drop policy if exists "feedback_reports_owner_insert" on public.feedback_reports;
drop policy if exists "feedback_reports_public_insert" on public.feedback_reports;
create policy "feedback_reports_public_insert"
  on public.feedback_reports
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "feedback_reports_owner_read" on public.feedback_reports;
drop policy if exists "feedback_reports_public_read_none" on public.feedback_reports;
create policy "feedback_reports_public_read_none"
  on public.feedback_reports
  for select
  to anon, authenticated
  using (false);

-- Question reports: allow inserts, keep reads locked down by default.
drop policy if exists "question_reports_owner_insert" on public.question_reports;
drop policy if exists "question_reports_public_insert" on public.question_reports;
create policy "question_reports_public_insert"
  on public.question_reports
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "question_reports_owner_read" on public.question_reports;
drop policy if exists "question_reports_public_read_none" on public.question_reports;
create policy "question_reports_public_read_none"
  on public.question_reports
  for select
  to anon, authenticated
  using (false);

-- Enterprise leads: only inserts are public (for contact form/API). No public reads.
drop policy if exists "enterprise_leads_public_insert" on public.enterprise_leads;
create policy "enterprise_leads_public_insert"
  on public.enterprise_leads
  for insert
  to anon, authenticated
  with check (true);

-- Analytics events: allow client event inserts; block public reads.
drop policy if exists "analytics_events_public_insert" on public.analytics_events;
create policy "analytics_events_public_insert"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);
