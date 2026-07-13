-- Fixes: "Could not find the 'user_id' column of 'matches' in the schema
-- cache" on every battle finish. /api/battle/finish (app/api/battle/finish/
-- route.ts) has been inserting `user_id` on every match row since the
-- guest/logged-in unification described in that file's top-of-file comment,
-- and app/mastery-map/page.tsx has been querying `matches.eq("user_id", ...)`
-- to find a logged-in student's own matches -- but no prior migration ever
-- added this column to the deployed public.matches table, so every battle
-- submission has been failing at the insert step.
--
-- Nullable: guest matches (no session token) still store user_id = null and
-- are attributed by player_name only, exactly as before this column existed.
--
-- Safe to run multiple times.

alter table if exists public.matches
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Used by mastery-map's `.eq("user_id", user.id)` lookup of a student's own
-- match history across decks.
create index if not exists idx_matches_user_id
  on public.matches (user_id)
  where user_id is not null;
