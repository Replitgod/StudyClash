-- Closes a real race condition in app/api/battle/finish/route.ts: the
-- existing duplicate-submission guard is a check-then-insert (SELECT for an
-- existing matching row, then INSERT if none found) with no DB-level
-- backing, so two genuinely concurrent finish requests (e.g. a slow
-- connection where a client retry fires before the first response lands)
-- can both pass the SELECT check and both INSERT, producing two `matches`
-- rows for the same battle. A DB-enforced unique constraint on a
-- client-generated idempotency key closes this atomically -- the database
-- itself rejects the second insert, which the route now catches and treats
-- as "already saved" rather than an error.
alter table public.matches
  add column if not exists client_request_id uuid;

create unique index if not exists matches_client_request_id_key
  on public.matches (client_request_id)
  where client_request_id is not null;
 