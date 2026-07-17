// Shared constants for the private /admin/marketing dashboard. Server-only
// in spirit (no secrets live here), but also imported by client pages for
// dropdown options, so this file must never import anything server-only
// (no service-role client, no OpenAI key).

// marketing_product_profile is a singleton row -- the app always
// upserts/reads this exact id, enforced at the DB level by a check
// constraint (see supabase/migrations/20260721_marketing_dashboard.sql).
export const MARKETING_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

export const CAMPAIGN_GOALS = [
  "get_beta_testers",
  "get_honest_feedback",
  "get_student_users",
  "promote_new_feature",
  "promote_ai_battles",
  "promote_exam_prep",
  "promote_pro",
  "announce_launch",
  "tutoring_center_interest",
  "school_club_interest",
  "collect_waitlist",
  "grow_social_accounts",
] as const;
export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number];

export const CAMPAIGN_GOAL_LABELS: Record<CampaignGoal, string> = {
  get_beta_testers: "Get beta testers",
  get_honest_feedback: "Get honest feedback",
  get_student_users: "Get student users",
  promote_new_feature: "Promote a new StudyClash feature",
  promote_ai_battles: "Promote AI study battles",
  promote_exam_prep: "Promote SAT or exam preparation",
  promote_pro: "Promote StudyClash Pro",
  announce_launch: "Announce a launch",
  tutoring_center_interest: "Get tutoring-center interest",
  school_club_interest: "Get school-club interest",
  collect_waitlist: "Collect waitlist sign-ups",
  grow_social_accounts: "Grow social accounts",
};

export const CAMPAIGN_TONES = [
  "student_friendly",
  "conversational",
  "founder_story",
  "excited",
  "professional",
  "honest_beta_request",
  "feedback_focused",
  "technical",
  "short_and_direct",
] as const;
export type CampaignTone = (typeof CAMPAIGN_TONES)[number];

export const CAMPAIGN_TONE_LABELS: Record<CampaignTone, string> = {
  student_friendly: "Student-friendly",
  conversational: "Conversational",
  founder_story: "Founder story",
  excited: "Excited",
  professional: "Professional",
  honest_beta_request: "Honest beta request",
  feedback_focused: "Feedback-focused",
  technical: "Technical",
  short_and_direct: "Short and direct",
};

export const CAMPAIGN_STATUSES = [
  "draft",
  "generating",
  "ready_for_review",
  "active",
  "paused",
  "completed",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const DESTINATION_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube_shorts",
  "linkedin",
  "x",
  "reddit",
  "discord_community",
  "student_community",
  "founder_community",
  "saas_directory",
  "startup_directory",
  "beta_testing_platform",
  "product_launch_platform",
  "education_community",
  "tutoring_community",
  "school_community",
  "newsletter",
  "forum",
] as const;
export type DestinationPlatform = (typeof DESTINATION_PLATFORMS)[number];

export const DESTINATION_PLATFORM_LABELS: Record<DestinationPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_shorts: "YouTube Shorts",
  linkedin: "LinkedIn",
  x: "X",
  reddit: "Reddit",
  discord_community: "Discord community",
  student_community: "Student community",
  founder_community: "Founder community",
  saas_directory: "SaaS directory",
  startup_directory: "Startup directory",
  beta_testing_platform: "Beta-testing platform",
  product_launch_platform: "Product-launch platform",
  education_community: "Education community",
  tutoring_community: "Tutoring community",
  school_community: "School community",
  newsletter: "Newsletter",
  forum: "Forum",
};

export const POSTING_METHODS = [
  "official_api",
  "draft_upload",
  "manual_submission",
  "copy_and_open",
  "unsupported",
] as const;
export type PostingMethod = (typeof POSTING_METHODS)[number];

export const POSTING_METHOD_LABELS: Record<PostingMethod, string> = {
  official_api: "Official API",
  draft_upload: "Draft upload",
  manual_submission: "Manual submission",
  copy_and_open: "Copy and open",
  unsupported: "Unsupported",
};

export const DRAFT_STATUSES = [
  "not_generated",
  "draft_ready",
  "needs_editing",
  "approved",
  "published",
  "submitted_manually",
  "failed",
  "removed",
  "rejected",
  "skipped",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  not_generated: "Not generated",
  draft_ready: "Draft ready",
  needs_editing: "Needs editing",
  approved: "Approved",
  published: "Published",
  submitted_manually: "Submitted manually",
  failed: "Failed",
  removed: "Removed",
  rejected: "Rejected",
  skipped: "Skipped",
};

export const INTEGRATION_STATUSES = [
  "connected",
  "not_connected",
  "mock_only",
  "approval_required",
  "manual_only",
  "unsupported",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

// Maps each destination platform to the content-generator it uses. Several
// platforms share a generator (e.g. every directory-style destination uses
// the same saas_directory generator shape).
export const GENERATOR_TYPES = [
  "reddit",
  "tiktok",
  "instagram",
  "linkedin",
  "x",
  "youtube_shorts",
  "saas_directory",
  "beta_community",
  "school_community",
] as const;
export type GeneratorType = (typeof GENERATOR_TYPES)[number];

export const PLATFORM_TO_GENERATOR: Record<DestinationPlatform, GeneratorType> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube_shorts: "youtube_shorts",
  linkedin: "linkedin",
  x: "x",
  reddit: "reddit",
  discord_community: "beta_community",
  student_community: "school_community",
  founder_community: "beta_community",
  saas_directory: "saas_directory",
  startup_directory: "saas_directory",
  beta_testing_platform: "beta_community",
  product_launch_platform: "saas_directory",
  education_community: "school_community",
  tutoring_community: "school_community",
  school_community: "school_community",
  newsletter: "saas_directory",
  forum: "beta_community",
};

export const DRAFT_EDIT_TYPES = [
  "generated",
  "regenerated",
  "shortened",
  "more_natural",
  "more_engaging",
  "less_promotional",
  "manual_edit",
] as const;
export type DraftEditType = (typeof DRAFT_EDIT_TYPES)[number];
