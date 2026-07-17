-- mistake_breakdowns has always been keyed for history lookups by
-- `player_name` (deck_id + player_name, see idx_mistake_breakdowns_deck_player_created
-- in 20260708_mistake_breakdowns.sql), which is a mutable, user-editable
-- display name, not a stable identity. app/api/mistake-breakdown/route.ts
-- resolves player_name fresh from profiles.display_name on every request,
-- so a user who has ever renamed themselves silently loses access to every
-- mistake_breakdowns row saved under their old name -- the "repeated
-- weakness" escalation (see lib/mistakeBreakdown.ts) then never fires for
-- rows split across the rename, with zero error or signal that history was
-- dropped.
--
-- Adds a stable user_id column and backfills it from the existing
-- match_id -> matches.user_id relationship where possible (matches.user_id
-- was added in 20260713_matches_user_id.sql). Rows with no resolvable user
-- (older guest-mode matches, if any exist) are left with user_id null and
-- keep falling back to the old player_name behavior.
--
-- Safe to run multiple times.

alter table if exists public.mistake_breakdowns
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.mistake_breakdowns mb
set user_id = m.user_id
from public.matches m
where mb.match_id = m.id
  and mb.user_id is null
  and m.user_id is not null;

create index if not exists idx_mistake_breakdowns_user_created
  on public.mistake_breakdowns (user_id, created_at desc);
