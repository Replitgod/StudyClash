-- Adds v2 mistake pattern metadata for richer long-term tracking.
-- Safe to run on existing environments.

alter table if exists public.mistake_breakdowns
  add column if not exists confidence_reason text,
  add column if not exists concept_key text,
  add column if not exists mistake_pattern_key text,
  add column if not exists rematch_mode text not null default 'practice';

create index if not exists idx_mistake_breakdowns_player_deck_confidence_created
  on public.mistake_breakdowns (player_name, deck_id, confidence_rating, created_at desc);

create index if not exists idx_mistake_breakdowns_concept_key
  on public.mistake_breakdowns (concept_key);

create index if not exists idx_mistake_breakdowns_pattern_key
  on public.mistake_breakdowns (mistake_pattern_key);
