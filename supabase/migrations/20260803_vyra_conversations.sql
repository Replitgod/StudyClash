-- Vyra becomes a real chat product with a conversation list, so a session
-- needs a name and needs to be listable per user.
--
-- Before this, `vyra_chat_sessions` rows were keyed by a derived id
-- (`vyra-${matchId || deckId || "global"}`) that collapsed every global
-- conversation a student ever had into a single row -- fine for the old
-- floating coach panel, which never showed history, but it means "recent
-- conversations" would have shown exactly one entry forever.
--
-- Two changes:
--   1. `title` so a conversation can be named (auto-named from the first
--      message, renameable by the student).
--   2. An index on (user_id, updated_at desc) so the sidebar list is a
--      single indexed read rather than a scan.
--
-- Nothing is renamed or dropped: existing rows keep working, they just have
-- a null title until they are next used.
--
-- Both tables stay RLS-on with zero anon/authenticated policies (see
-- 20260713_vyra_chat_tables.sql). They are only ever read or written by the
-- service-role client inside app/api/vyra/conversations/* and
-- app/api/vyra-chat, which authenticate the caller themselves and scope
-- every query to that caller's user_id.
--
-- Safe to run multiple times.

alter table if exists public.vyra_chat_sessions
  add column if not exists title text;

create index if not exists idx_vyra_chat_sessions_user_updated
  on public.vyra_chat_sessions (user_id, updated_at desc);
