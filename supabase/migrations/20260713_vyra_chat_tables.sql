-- app/api/vyra-chat/route.ts (saveChatIfTableExists) has been reading and
-- writing `vyra_chat_sessions`/`vyra_chat_messages` since VYRA shipped, but
-- no migration in this repo ever created them -- they exist in the deployed
-- database (if at all) from a manual dashboard action, with no recorded
-- schema and, more importantly, no verified row level security. Since the
-- anon key ships in every page bundle, a table with RLS off (or never
-- explicitly enabled) is readable/writable by anyone who points their own
-- Supabase client at this project's URL, regardless of what the app's own
-- UI does.
--
-- `saveChatIfTableExists` already tolerates a missing table (it checks
-- `.error` and no-ops), so `create table if not exists` here is safe either
-- way: if the table already exists in production this is a no-op schema
-- statement, and RLS gets enabled either way.
--
-- Both tables are only ever touched server-side via the service-role client
-- in app/api/vyra-chat/route.ts (never a direct browser Supabase call), so
-- this follows the same "RLS on, zero anon/authenticated policies" pattern
-- used for classroom_rooms/generation_cache/etc. in
-- 20260711_core_tables_rls_hardening.sql -- costs nothing functionally,
-- closes the table off completely if a future regression ever adds a
-- client-side call.
--
-- session id is a free-form string (`vyra-${matchId || deckId || "global"}`
-- from the route), not a uuid, hence `text primary key`.
--
-- Safe to run multiple times.

create table if not exists public.vyra_chat_sessions (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  deck_id uuid references public.decks(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyra_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.vyra_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyra_chat_messages_session_id
  on public.vyra_chat_messages (session_id);

alter table if exists public.vyra_chat_sessions enable row level security;
alter table if exists public.vyra_chat_messages enable row level security;
