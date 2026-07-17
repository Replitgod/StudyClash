-- Freeform field for external research about when a destination's audience
-- is most active (e.g. subreddit activity from a tool like Pulse for
-- Reddit, or any other outside timing research) -- purely informational,
-- surfaced in the destination recommendation reasons and the destinations
-- table. Not tied to any specific tool or automated integration.
--
-- Safe to run multiple times.

alter table if exists public.marketing_destinations
  add column if not exists best_posting_time text;
