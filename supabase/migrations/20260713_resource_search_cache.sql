-- app/api/find-resources/route.ts re-runs a live Tavily search plus an
-- OpenAI ranking call on every request, even when two students search the
-- exact same topic minutes apart -- unlike generate-questions, which already
-- has generation_cache for this. generation_cache's schema is
-- question-generation-specific (question_count/difficulty_mode/questions
-- jsonb shaped like MC/TF questions), so this is a small dedicated table
-- rather than overloading that one.
--
-- Only ever touched server-side via the service-role client in
-- find-resources/route.ts, so RLS is enabled with zero anon/authenticated
-- policies -- same defense-in-depth pattern as the other service-role-only
-- tables in this repo.
--
-- Safe to run multiple times.

create table if not exists public.resource_search_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  query text not null,
  resources jsonb not null,
  disclaimer text,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_resource_search_cache_key
  on public.resource_search_cache (cache_key, updated_at desc);

alter table if exists public.resource_search_cache enable row level security;
