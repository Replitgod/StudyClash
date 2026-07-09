-- Stores rich per-missed-question diagnostics so StudyClash can track
-- repeated mistake patterns over time.

create table if not exists public.mistake_breakdowns (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  player_name text not null,
  topic text not null,
  selected_answer text not null,
  correct_answer text not null,
  tempting_but_wrong_reason text not null,
  correct_why_reason text not null,
  misunderstood_concept text not null,
  simpler_explanation text not null,
  memory_trick text not null,
  mini_follow_up_question text not null,
  confidence_rating text not null check (
    confidence_rating in (
      'careless_mistake',
      'concept_gap',
      'slow_response',
      'guessing_pattern'
    )
  ),
  response_time_ms integer not null default 0,
  difficulty text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, question_id)
);

create index if not exists idx_mistake_breakdowns_deck_player_created
  on public.mistake_breakdowns (deck_id, player_name, created_at desc);

create index if not exists idx_mistake_breakdowns_topic
  on public.mistake_breakdowns (topic);

create index if not exists idx_mistake_breakdowns_confidence
  on public.mistake_breakdowns (confidence_rating);

create or replace function public.set_mistake_breakdowns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mistake_breakdowns_updated_at on public.mistake_breakdowns;

create trigger trg_mistake_breakdowns_updated_at
before update on public.mistake_breakdowns
for each row
execute function public.set_mistake_breakdowns_updated_at();

alter table public.mistake_breakdowns enable row level security;

-- Read and write can be done from server-side service-role routes.
-- Optionally allow authenticated users to read their own deck-related rows
-- if your app exposes direct client reads in the future.
create policy if not exists "authenticated_read_mistake_breakdowns"
  on public.mistake_breakdowns
  for select
  to authenticated
  using (true);
