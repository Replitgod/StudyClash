-- profiles.plan has a foreign-key constraint against membership_plans(id),
-- but membership_plans only ever had rows for free_beta/pro_preview/founder
-- -- not pro_individual, exam_tunnel, or team_pass, even though lib/plans.ts
-- (the app-level source of truth) has always listed all six as valid PlanIds.
--
-- This went unnoticed until the Stripe webhook tried to set
-- profiles.plan = 'pro_individual' on a successful subscription and got a
-- silent 23503 foreign-key-violation on every single grant -- Pro access
-- could never actually activate. Backfilling the missing rows here closes
-- the gap; lib/plans.ts PLAN_METADATA remains the richer source of truth
-- for pricing-page copy, membership_plans is just the FK-satisfying
-- id/label/daily_limit/description table read by app/account/page.tsx.
--
-- Safe to run multiple times.

insert into public.membership_plans (id, label, daily_limit, description)
values
  ('pro_individual', 'AcedIQ Pro', null, 'Unlimited deck generation, full diagnostics, and every exam tunnel.'),
  ('exam_tunnel', 'AcedIQ Pro', null, 'Legacy plan id, folded into AcedIQ Pro -- kept resolvable for existing accounts.'),
  ('team_pass', 'Team/Guild Pass', null, 'Shared unlimited group usage during the pilot.')
on conflict (id) do update set
  label = excluded.label,
  daily_limit = excluded.daily_limit,
  description = excluded.description;
