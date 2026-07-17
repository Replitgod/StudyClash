-- Stripe subscriptions for StudyClash Pro ($3/mo, price id in
-- STRIPE_PRO_PRICE_ID). Adds a customer-id column to profiles (set on first
-- checkout attempt, service-role only) and a subscriptions table synced
-- exclusively from the verified /api/stripe/webhook handler -- the client
-- never writes to either.
--
-- One row per user in `subscriptions` (unique on user_id): checkout is
-- blocked server-side while an existing row is active/trialing/past_due,
-- so a user can't accumulate duplicate Stripe subscriptions.
--
-- Safe to run multiple times.

alter table if exists public.profiles
  add column if not exists stripe_customer_id text;

drop index if exists public.profiles_stripe_customer_id_key;
create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  price_id text,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_stripe_subscription_id_key
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- subscriptions: a user may read only their own row (used to show "Manage
-- Subscription" vs "Upgrade" in the account UI). No client inserts/updates/
-- deletes -- every write comes from the service-role webhook handler after
-- Stripe signature verification, never from the browser.
alter table if exists public.subscriptions enable row level security;
drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own"
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());
