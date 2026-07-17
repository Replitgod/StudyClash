import type {
  CampaignGoal,
  CampaignStatus,
  CampaignTone,
  DestinationPlatform,
  DraftEditType,
  DraftStatus,
  IntegrationStatus,
  PostingMethod,
} from "./constants";

export type MarketingProductProfile = {
  id: string;
  product_name: string | null;
  website_url: string | null;
  tagline: string | null;
  short_description: string | null;
  long_description: string | null;
  target_users: string | null;
  main_problem_solved: string | null;
  main_features: string[];
  unique_advantages: string[];
  free_plan_details: string | null;
  pro_details: string | null;
  current_pricing: string | null;
  beta_status: string | null;
  founder_story: string | null;
  founder_age_or_student_status: string | null;
  logo_url: string | null;
  screenshots: string[];
  demo_videos: string[];
  social_links: Record<string, string>;
  support_email: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  preferred_cta: string | null;
  verified_usage_stats: Record<string, string | number>;
  updated_at: string;
  updated_by: string | null;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  goal: CampaignGoal;
  target_audience: string | null;
  main_message: string | null;
  call_to_action: string | null;
  feature_promoted: string | null;
  tone: CampaignTone | null;
  launch_date: string | null;
  start_date: string | null;
  end_date: string | null;
  screenshot_urls: string[];
  video_url: string | null;
  notes: string | null;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingDestination = {
  id: string;
  name: string;
  platform: DestinationPlatform;
  community_or_directory_name: string | null;
  destination_type: string;
  submission_url: string | null;
  homepage_url: string | null;
  posting_method: PostingMethod;
  audience: string | null;
  best_campaign_goals: string[];
  title_limit: number | null;
  body_limit: number | null;
  media_requirements: string | null;
  link_restrictions: string | null;
  promotional_rules: string | null;
  self_promotion_allowed: boolean | null;
  allowed_promotion_days: string[];
  account_requirements: string | null;
  min_karma_or_reputation: number | null;
  reposting_cooldown_days: number | null;
  // Freeform notes from external research (e.g. Pulse for Reddit, or any
  // other subreddit/audience-activity tool) about when this destination's
  // audience is most active. Informational only -- never used to schedule
  // an automatic post, just surfaced to help a human time a manual one.
  best_posting_time: string | null;
  api_availability: boolean;
  manual_review_required: boolean;
  last_rules_review_date: string | null;
  last_posted_date: string | null;
  last_result: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MarketingDraft = {
  id: string;
  campaign_id: string;
  destination_id: string;
  platform: string;
  content_type: string;
  title: string | null;
  body: string | null;
  video_script: Record<string, unknown> | null;
  hashtags: string[];
  media_urls: string[];
  tracking_link_fk: string | null;
  similarity_score: number | null;
  status: DraftStatus;
  moderator_feedback: string | null;
  published_url: string | null;
  external_post_id: string | null;
  generated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingDraftVersion = {
  id: string;
  draft_id: string;
  version_number: number;
  title: string | null;
  body: string | null;
  video_script: Record<string, unknown> | null;
  hashtags: string[];
  edit_type: DraftEditType;
  created_at: string;
};

export type MarketingPublication = {
  id: string;
  campaign_id: string;
  destination_id: string;
  draft_id: string | null;
  posted_at: string | null;
  submitted_url: string | null;
  post_status: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  clicks: number | null;
  sign_ups: number | null;
  battle_completions: number | null;
  paid_subscriptions: number | null;
  removed: boolean;
  removal_reason: string | null;
  moderator_feedback: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingTrackingLink = {
  id: string;
  campaign_id: string | null;
  destination_id: string | null;
  draft_id: string | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  full_url: string;
  short_label: string | null;
  click_count: number;
  created_at: string;
};

export type MarketingIntegration = {
  id: string;
  platform: string;
  status: IntegrationStatus;
  connected_account_label: string | null;
  notes: string | null;
  updated_at: string;
};

// Content shape returned by every generator -- video-specific fields are
// left null/empty for text-only platforms (Reddit, X, LinkedIn, directories).
export type GeneratedDraftContent = {
  title: string | null;
  body: string;
  hashtags: string[];
  video_script: Record<string, unknown> | null;
};
