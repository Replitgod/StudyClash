-- Growth foundations for monetization and loop-back mechanics.
-- Backward compatible: only additive tables/columns/indexes.

alter table if exists public.generation_logs
  add column if not exists source_kind text not null default 'manual',
  add column if not exists is_priority boolean not null default false,
  add column if not exists plan_id_snapshot text;

create index if not exists idx_generation_logs_user_created
  on public.generation_logs (user_id, created_at desc);

create index if not exists idx_generation_logs_user_source_created
  on public.generation_logs (user_id, source_kind, created_at desc);

create table if not exists public.generation_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  source_hash text not null,
  source_kind text not null default 'manual',
  question_count integer not null,
  difficulty_mode text not null,
  question_type text not null,
  grade_level text,
  topic_focus text,
  questions jsonb not null,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generation_cache_source_hash
  on public.generation_cache (source_hash, updated_at desc);

create table if not exists public.challenge_notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  deck_id uuid references public.decks(id) on delete set null,
  source_match_id uuid references public.matches(id) on delete set null,
  event_type text not null check (
    event_type in (
      'crown_taken',
      'challenge_received',
      'ghost_battle_available'
    )
  ),
  title text not null,
  message text not null,
  action_href text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_challenge_notifications_target_created
  on public.challenge_notifications (target_user_id, created_at desc);

create index if not exists idx_challenge_notifications_target_unread
  on public.challenge_notifications (target_user_id, is_read, created_at desc);

alter table public.challenge_notifications enable row level security;

alter table if exists public.challenge_notifications
  alter column target_user_id drop not null;

alter table if exists public.challenge_notifications
  add column if not exists target_player_name text;

drop policy if exists "challenge_notifications_owner_read" on public.challenge_notifications;
create policy "challenge_notifications_owner_read"
  on public.challenge_notifications
  for select
  to authenticated
  using (auth.uid() = target_user_id);

drop policy if exists "challenge_notifications_owner_update" on public.challenge_notifications;
create policy "challenge_notifications_owner_update"
  on public.challenge_notifications
  for update
  to authenticated
  using (auth.uid() = target_user_id)
  with check (auth.uid() = target_user_id);

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text unique,
  style_theme text,
  member_limit integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists idx_study_group_members_group
  on public.study_group_members (group_id, created_at desc);

create index if not exists idx_study_group_members_user
  on public.study_group_members (user_id, created_at desc);

create table if not exists public.email_notification_queue (
  id uuid primary key default gen_random_uuid(),
  recipient_email text,
  recipient_player_name text,
  event_type text not null,
  subject text not null,
  body text not null,
  action_href text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_email_notification_queue_status_created
  on public.email_notification_queue (status, created_at asc);

create table if not exists public.classroom_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  room_code text not null unique,
  title text not null,
  deck_id uuid references public.decks(id) on delete set null,
  is_live boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_classroom_rooms_owner_created
  on public.classroom_rooms (owner_user_id, created_at desc);
