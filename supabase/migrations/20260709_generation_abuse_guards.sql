-- Adds optional request fingerprint fields used for abuse throttling and monitoring.
-- Safe to run multiple times.

alter table if exists public.generation_logs
  add column if not exists ip_hash text;

alter table if exists public.generation_logs
  add column if not exists user_agent_snapshot text;

alter table if exists public.generation_logs
  add column if not exists notes_char_count integer;

create index if not exists generation_logs_user_created_idx
  on public.generation_logs (user_id, created_at desc);

create index if not exists generation_logs_ip_created_idx
  on public.generation_logs (ip_hash, created_at desc)
  where ip_hash is not null;
