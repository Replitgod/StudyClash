-- Adds a persisted, per-user opt-out for the Results-page "Roast" feature
-- (safe, template-based roast lines built from real match stats -- see
-- lib/roastGenerator.ts; never an LLM call, never references appearance,
-- intelligence, disability, or any other forbidden category). Defaults to
-- true because roasts are the shipped default experience, but every
-- student can turn them off permanently -- a profiles column (not
-- localStorage) so the preference follows the student across devices,
-- matching the existing profiles.display_name / profiles.plan
-- per-user-setting pattern. No new RLS policy needed: profiles_update_own
-- (20260711_core_tables_rls_hardening.sql) already covers any column the
-- owning user updates.
--
-- Safe to run multiple times.

alter table if exists public.profiles
  add column if not exists roasts_enabled boolean not null default true;
