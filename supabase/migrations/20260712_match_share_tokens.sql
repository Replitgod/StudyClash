-- Adds an opaque, expiring share token to matches, used by the
-- "Challenge a Friend" link (/challenge/[token]) instead of the raw match
-- row id. This does NOT restrict read access to match data -- matches_read
-- (20260711_core_tables_rls_hardening.sql) intentionally keeps matches
-- publicly readable by id for leaderboards and ghost-replay, and this
-- migration does not change that. The token only lets a stale/old challenge
-- link stop resolving after expiry; it is not an access-control boundary.
--
-- Token issuance/rotation goes through /api/challenge/create (service
-- role) only -- matches has no client-side UPDATE policy, so the anon/
-- authenticated client cannot set its own share_token.
--
-- Safe to run multiple times.

alter table if exists public.matches
  add column if not exists share_token text;

alter table if exists public.matches
  add column if not exists share_token_expires_at timestamptz;

create unique index if not exists matches_share_token_key
  on public.matches (share_token)
  where share_token is not null;
