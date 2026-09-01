-- Public, shareable study sets.
--
-- This is the one structural thing Quizlet has that AceDecks did not: a study
-- set with a URL you can send to a classmate, and that a search engine can
-- index. Their decade of indexed public sets is the distribution engine that
-- made them the default, and it is a mechanism, not a brand -- so it is
-- buildable.
--
-- Note what this does NOT change. `decks` and `questions` were already
-- RLS-readable by reference (see 20260711_core_tables_rls_hardening.sql:
-- both are `using (true)` for anon) because challenge links, leaderboards
-- and ghost replay need to resolve a deck the viewer does not own. So the
-- rows were always reachable by anyone holding an id.
--
-- What is new is *discoverability*, and that is exactly why it is opt-in:
--   - is_public   the owner's explicit decision, default false
--   - share_slug  a stable, guessable-resistant public address, minted only
--                 when the deck is first published
--   - shared_at   when they published, so the sitemap can order by it
--
-- student_name is deliberately never exposed on the public page. It is on
-- the deck row, it is a real person's name, and nobody publishing a study
-- set is asking to publish that.
--
-- Safe to run more than once.

alter table if exists public.decks
  add column if not exists is_public boolean not null default false;

alter table if exists public.decks
  add column if not exists share_slug text;

alter table if exists public.decks
  add column if not exists shared_at timestamptz;

-- One deck per slug. Partial, so the many unpublished decks (all NULL) do
-- not collide with each other -- a plain unique index would be fine on NULLs
-- in Postgres, but being explicit keeps the index small and its intent
-- obvious.
create unique index if not exists decks_share_slug_key
  on public.decks (share_slug)
  where share_slug is not null;

-- The public page and the sitemap both look a deck up by slug, and both only
-- ever want published ones.
create index if not exists decks_public_shared_at_idx
  on public.decks (shared_at desc)
  where is_public = true;

-- `decks` already has a select policy of `using (true)` for anon and
-- authenticated, so no policy change is needed to read a published deck.
-- Writes stay closed to the browser entirely: publishing and unpublishing go
-- through POST/DELETE /api/library/share, which checks ownership with the
-- service-role client. A client-side update against decks silently matches
-- zero rows (there is no update policy), so it must not be attempted -- the
-- same trap documented in app/api/library/material/route.ts.

comment on column public.decks.is_public is
  'Owner opted this deck into a public, indexable page at /d/<share_slug>. Written only by /api/library/share.';
comment on column public.decks.share_slug is
  'Stable public address. Minted on first publish and never reissued, so a link already shared keeps working even if the deck is unpublished and republished.';
