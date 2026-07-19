-- Private internal marketing/launch-distribution dashboard (/admin/marketing).
-- Every table here is admin-only: normal AcedIQ users have zero access,
-- enforced by RLS with no anon/authenticated policies at all (service-role
-- always bypasses RLS -- every read/write goes through
-- app/api/admin/marketing/* routes, which independently re-check
-- requireAdminUser() against ADMIN_EMAILS on every request). The one
-- exception is marketing_events, which needs public INSERT so a real
-- visitor's browser can record attributed conversion events -- it mirrors
-- the existing analytics_events table's "public insert, zero read policy"
-- shape exactly.
--
-- Safe to run multiple times.

-- ---------------------------------------------------------------------
-- marketing_product_profile: one reusable row describing AcedIQ for
-- content generation. The app always upserts against a single fixed id
-- (MARKETING_PROFILE_ID in lib/server/marketing/constants.ts) rather than
-- allowing multiple rows -- enforced here by a check constraint, not just
-- app-level convention.
-- ---------------------------------------------------------------------
create table if not exists public.marketing_product_profile (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid
    check (id = '00000000-0000-0000-0000-000000000001'::uuid),
  product_name text,
  website_url text,
  tagline text,
  short_description text,
  long_description text,
  target_users text,
  main_problem_solved text,
  main_features text[] not null default '{}',
  unique_advantages text[] not null default '{}',
  free_plan_details text,
  pro_details text,
  current_pricing text,
  beta_status text,
  founder_story text,
  founder_age_or_student_status text,
  logo_url text,
  screenshots text[] not null default '{}',
  demo_videos text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  support_email text,
  privacy_policy_url text,
  terms_url text,
  preferred_cta text,
  -- Only ever populated with real, verified numbers -- omit a field
  -- entirely rather than invent a value. e.g. {"registered_users": 42}.
  verified_usage_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- marketing_campaigns
-- ---------------------------------------------------------------------
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null check (goal in (
    'get_beta_testers', 'get_honest_feedback', 'get_student_users',
    'promote_new_feature', 'promote_ai_battles', 'promote_exam_prep',
    'promote_pro', 'announce_launch', 'tutoring_center_interest',
    'school_club_interest', 'collect_waitlist', 'grow_social_accounts'
  )),
  target_audience text,
  main_message text,
  call_to_action text,
  feature_promoted text,
  tone text check (tone in (
    'student_friendly', 'conversational', 'founder_story', 'excited',
    'professional', 'honest_beta_request', 'feedback_focused',
    'technical', 'short_and_direct'
  )),
  launch_date date,
  start_date date,
  end_date date,
  screenshot_urls text[] not null default '{}',
  video_url text,
  notes text,
  status text not null default 'draft' check (status in (
    'draft', 'generating', 'ready_for_review', 'active', 'paused', 'completed'
  )),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_status
  on public.marketing_campaigns (status);
create index if not exists idx_marketing_campaigns_goal
  on public.marketing_campaigns (goal);

-- ---------------------------------------------------------------------
-- marketing_destinations: seeded with examples, every row's rules are
-- explicitly "requires manual verification" -- see last_rules_review_date.
-- ---------------------------------------------------------------------
create table if not exists public.marketing_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  platform text not null check (platform in (
    'tiktok', 'instagram', 'youtube_shorts', 'linkedin', 'x', 'reddit',
    'discord_community', 'student_community', 'founder_community',
    'saas_directory', 'startup_directory', 'beta_testing_platform',
    'product_launch_platform', 'education_community', 'tutoring_community',
    'school_community', 'newsletter', 'forum'
  )),
  community_or_directory_name text,
  destination_type text not null,
  submission_url text,
  homepage_url text,
  posting_method text not null default 'unsupported' check (posting_method in (
    'official_api', 'draft_upload', 'manual_submission', 'copy_and_open', 'unsupported'
  )),
  audience text,
  best_campaign_goals text[] not null default '{}',
  title_limit integer,
  body_limit integer,
  media_requirements text,
  link_restrictions text,
  promotional_rules text,
  self_promotion_allowed boolean,
  allowed_promotion_days text[] not null default '{}',
  account_requirements text,
  min_karma_or_reputation integer,
  reposting_cooldown_days integer,
  api_availability boolean not null default false,
  manual_review_required boolean not null default true,
  -- Rules drift constantly (community mods change them without notice) --
  -- this date is surfaced everywhere a destination's rules are shown so a
  -- stale seed row is never presented as a guaranteed-current rule.
  last_rules_review_date date,
  last_posted_date date,
  last_result text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_destinations_platform
  on public.marketing_destinations (platform);
create index if not exists idx_marketing_destinations_active
  on public.marketing_destinations (active);

-- ---------------------------------------------------------------------
-- marketing_campaign_destinations: join table + recommendation metadata
-- ---------------------------------------------------------------------
create table if not exists public.marketing_campaign_destinations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  destination_id uuid not null references public.marketing_destinations(id) on delete cascade,
  relevance_score numeric,
  recommendation_reason text,
  created_at timestamptz not null default now(),
  unique (campaign_id, destination_id)
);

create index if not exists idx_marketing_campaign_destinations_campaign
  on public.marketing_campaign_destinations (campaign_id);

-- ---------------------------------------------------------------------
-- marketing_drafts
-- ---------------------------------------------------------------------
create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  destination_id uuid not null references public.marketing_destinations(id) on delete cascade,
  platform text not null,
  content_type text not null,
  title text,
  body text,
  video_script jsonb,
  hashtags text[] not null default '{}',
  media_urls text[] not null default '{}',
  tracking_link_id uuid,
  similarity_score numeric,
  status text not null default 'not_generated' check (status in (
    'not_generated', 'draft_ready', 'needs_editing', 'approved', 'published',
    'submitted_manually', 'failed', 'removed', 'rejected', 'skipped'
  )),
  moderator_feedback text,
  published_url text,
  external_post_id text,
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_drafts_campaign
  on public.marketing_drafts (campaign_id);
create index if not exists idx_marketing_drafts_destination
  on public.marketing_drafts (destination_id);
create index if not exists idx_marketing_drafts_status
  on public.marketing_drafts (status);

-- ---------------------------------------------------------------------
-- marketing_draft_versions: every edit/regenerate/approve keeps history
-- ---------------------------------------------------------------------
create table if not exists public.marketing_draft_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.marketing_drafts(id) on delete cascade,
  version_number integer not null,
  title text,
  body text,
  video_script jsonb,
  hashtags text[] not null default '{}',
  edit_type text not null default 'generated' check (edit_type in (
    'generated', 'regenerated', 'shortened', 'more_natural', 'more_engaging',
    'less_promotional', 'manual_edit'
  )),
  created_at timestamptz not null default now(),
  unique (draft_id, version_number)
);

create index if not exists idx_marketing_draft_versions_draft
  on public.marketing_draft_versions (draft_id, version_number desc);

-- ---------------------------------------------------------------------
-- marketing_tracking_links (UTM link records)
-- ---------------------------------------------------------------------
create table if not exists public.marketing_tracking_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  destination_id uuid references public.marketing_destinations(id) on delete set null,
  draft_id uuid references public.marketing_drafts(id) on delete set null,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text,
  full_url text not null,
  short_label text,
  click_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_tracking_links_campaign
  on public.marketing_tracking_links (campaign_id);
create index if not exists idx_marketing_tracking_links_utm
  on public.marketing_tracking_links (utm_source, utm_campaign, utm_content);

alter table if exists public.marketing_drafts
  add column if not exists tracking_link_fk uuid references public.marketing_tracking_links(id) on delete set null;

-- ---------------------------------------------------------------------
-- marketing_publications (posting history, incl. manually-entered metrics)
-- ---------------------------------------------------------------------
create table if not exists public.marketing_publications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  destination_id uuid not null references public.marketing_destinations(id) on delete cascade,
  draft_id uuid references public.marketing_drafts(id) on delete set null,
  posted_at timestamptz,
  submitted_url text,
  post_status text,
  views integer,
  likes integer,
  comments integer,
  clicks integer,
  sign_ups integer,
  battle_completions integer,
  paid_subscriptions integer,
  removed boolean not null default false,
  removal_reason text,
  moderator_feedback text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_publications_campaign
  on public.marketing_publications (campaign_id);
create index if not exists idx_marketing_publications_destination
  on public.marketing_publications (destination_id, posted_at desc);

-- ---------------------------------------------------------------------
-- marketing_events: attribution funnel events. Populated two ways --
-- (1) client-side dual-write from lib/trackEvent.ts whenever a visitor's
-- session carries stored UTM/campaign attribution (see
-- lib/marketingAttribution.ts), so real product events (signup_completed,
-- battle_started, checkout_started, subscription_activated, etc.) get
-- attributed without duplicating AcedIQ's whole analytics pipeline;
-- (2) server-side from the webhook/checkout routes for
-- subscription_activated specifically, same as analytics_events.
-- ---------------------------------------------------------------------
create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid,
  page_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  destination_id uuid references public.marketing_destinations(id) on delete set null,
  draft_id uuid references public.marketing_drafts(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_events_campaign
  on public.marketing_events (campaign_id, created_at desc);
create index if not exists idx_marketing_events_destination
  on public.marketing_events (destination_id, created_at desc);
create index if not exists idx_marketing_events_event_name
  on public.marketing_events (event_name);
create index if not exists idx_marketing_events_utm
  on public.marketing_events (utm_source, utm_campaign);

-- ---------------------------------------------------------------------
-- marketing_integrations: adapter connection status per platform. Phase 1
-- ships with every row manual_only/not_connected -- no OAuth tokens are
-- ever stored until a real, approved API integration is wired up in a
-- later phase, and even then the token column is never selected by any
-- client-reachable code path.
-- ---------------------------------------------------------------------
create table if not exists public.marketing_integrations (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  status text not null default 'manual_only' check (status in (
    'connected', 'not_connected', 'mock_only', 'approval_required', 'manual_only', 'unsupported'
  )),
  connected_account_label text,
  oauth_token_encrypted text,
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- marketing_activity_logs: audit trail of admin actions on this dashboard
-- ---------------------------------------------------------------------
create table if not exists public.marketing_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_activity_logs_admin
  on public.marketing_activity_logs (admin_user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS: every table above is admin-only. Enable RLS with zero
-- anon/authenticated policies (service-role bypasses RLS unconditionally),
-- same "defense in depth" pattern as classroom_rooms/generation_cache in
-- 20260711_core_tables_rls_hardening.sql -- costs nothing functionally
-- since every real read/write already goes through service-role API
-- routes, and it closes the tables off completely if a future regression
-- ever adds a direct client-side query.
-- ---------------------------------------------------------------------
alter table if exists public.marketing_product_profile enable row level security;
alter table if exists public.marketing_campaigns enable row level security;
alter table if exists public.marketing_destinations enable row level security;
alter table if exists public.marketing_campaign_destinations enable row level security;
alter table if exists public.marketing_drafts enable row level security;
alter table if exists public.marketing_draft_versions enable row level security;
alter table if exists public.marketing_tracking_links enable row level security;
alter table if exists public.marketing_publications enable row level security;
alter table if exists public.marketing_integrations enable row level security;
alter table if exists public.marketing_activity_logs enable row level security;

-- marketing_events is the one exception: a real visitor's browser (not an
-- admin) needs to record their own attributed conversion event, exactly
-- like analytics_events already allows. No read policy -- only the
-- marketing dashboard's service-role API routes can query it back.
alter table if exists public.marketing_events enable row level security;
drop policy if exists "marketing_events_public_insert" on public.marketing_events;
create policy "marketing_events_public_insert"
  on public.marketing_events
  for insert
  to anon, authenticated
  with check (true);
