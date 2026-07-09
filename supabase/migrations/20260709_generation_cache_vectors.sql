-- Add lightweight vector metadata for semantic-near cache hits.
-- Additive and backward compatible.

alter table if exists public.generation_cache
  add column if not exists source_vector jsonb,
  add column if not exists source_text_length integer not null default 0;

create index if not exists idx_generation_cache_lookup
  on public.generation_cache (
    question_count,
    difficulty_mode,
    question_type,
    source_kind,
    updated_at desc
  );
