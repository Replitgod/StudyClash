import type { GeneratorType } from "./constants";
import type { MarketingCampaign, MarketingDestination, MarketingProductProfile } from "./types";
import { CAMPAIGN_GOAL_LABELS, CAMPAIGN_TONE_LABELS } from "./constants";

// Every generator produces the same JSON envelope so one OpenAI call shape
// and one validator cover all nine platforms -- the platform-specific
// pieces (hook, shot list, voiceover, submission answers, feedback
// questions, etc.) all live inside `structured` rather than needing a
// separate schema per generator.
export type GeneratedContent = {
  title: string | null;
  body: string;
  hashtags: string[];
  structured: Record<string, unknown>;
};

function profileFactsBlock(profile: MarketingProductProfile): string {
  // Only include fields that are actually filled in -- an empty field must
  // never be silently invented by the model. This is the single mechanism
  // that enforces "never invent statistics, testimonials, awards, users,
  // revenue, partnerships, or claims" -- if it's not here, it doesn't exist
  // as far as the model is concerned.
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  push("Product name", profile.product_name);
  push("Website", profile.website_url);
  push("Tagline", profile.tagline);
  push("Short description", profile.short_description);
  push("Long description", profile.long_description);
  push("Target users", profile.target_users);
  push("Main problem solved", profile.main_problem_solved);
  if (profile.main_features.length) push("Main features", profile.main_features.join("; "));
  if (profile.unique_advantages.length) push("Unique advantages", profile.unique_advantages.join("; "));
  push("Free plan", profile.free_plan_details);
  push("StudyClash Pro", profile.pro_details);
  push("Current pricing", profile.current_pricing);
  push("Beta status", profile.beta_status);
  push("Founder story", profile.founder_story);
  push("Founder note", profile.founder_age_or_student_status);
  push("Support email", profile.support_email);
  push("Preferred call to action", profile.preferred_cta);

  const statsEntries = Object.entries(profile.verified_usage_stats || {}).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
  );
  if (statsEntries.length) {
    lines.push(`Verified usage stats (ONLY use these numbers, never estimate or round up): ${statsEntries
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`);
  } else {
    lines.push("Verified usage stats: none recorded. Do not state or imply any user count, revenue, or growth number.");
  }

  return lines.join("\n");
}

function campaignFactsBlock(campaign: MarketingCampaign): string {
  const lines: string[] = [
    `Campaign goal: ${CAMPAIGN_GOAL_LABELS[campaign.goal]}`,
  ];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  push("Target audience", campaign.target_audience);
  push("Main message", campaign.main_message);
  push("Call to action", campaign.call_to_action);
  push("Feature being promoted", campaign.feature_promoted);
  if (campaign.tone) lines.push(`Tone: ${CAMPAIGN_TONE_LABELS[campaign.tone]}`);
  push("Notes", campaign.notes);
  return lines.join("\n");
}

function destinationFactsBlock(destination: MarketingDestination): string {
  const lines: string[] = [
    `Destination: ${destination.name} (${destination.destination_type})`,
  ];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim()) lines.push(`${label}: ${value}`);
  };
  push("Audience", destination.audience);
  push("Title limit (characters)", destination.title_limit);
  push("Body limit (characters)", destination.body_limit);
  push("Promotional rules", destination.promotional_rules);
  push("Link restrictions", destination.link_restrictions);
  push("Media requirements", destination.media_requirements);
  return lines.join("\n");
}

const SHARED_GUARDRAILS = `
Hard rules, no exceptions:
- Never invent statistics, user counts, revenue, testimonials, awards, or partnerships. Only use numbers explicitly given above under "Verified usage stats."
- Never say StudyClash guarantees higher grades or better test scores.
- Never claim "thousands of users" or any user-count claim unless that exact number is in the verified stats above.
- Be honest that this is a real product built by a real person -- when the destination expects a personal voice (Reddit, founder communities, beta communities, LinkedIn), disclose that you (the poster) built StudyClash.
- Do not write generic corporate marketing language ("revolutionize," "game-changer," "seamless," "unlock your potential"). Write like an actual person.
- This content must be genuinely different from content generated for any other destination -- don't reuse the same phrasing, opening line, or structure.
`.trim();

type GeneratorConfig = {
  instructions: string;
  jsonShape: string;
};

const GENERATOR_CONFIGS: Record<GeneratorType, GeneratorConfig> = {
  reddit: {
    instructions: `
Write a Reddit post for this specific subreddit/community.

Required approach:
- Natural, conversational title (not clickbait, not corporate).
- Conversational body written like a real person posting to a community they respect, not an ad.
- Honestly disclose that you built StudyClash.
- Make a specific request for feedback, not a vague "check it out."
- Clearly explain what testers should actually try (e.g. "try uploading a page of your own notes and battling the AI").
- Minimal emojis (zero to one, only if it fits the community's normal tone).
- No aggressive sales pitch, no bullet-point feature list, no corporate marketing language.
- End with 2-4 short, specific feedback questions drawn from (but not limited to) this pool: "Was the app easy to understand?", "Were the questions accurate?", "Was anything confusing?", "Did anything break?", "Would you use this before a test?"
- Mention the link once, placed naturally (not as a header/CTA button).
`.trim(),
    jsonShape: `{"title": string, "body": string, "hashtags": [], "structured": {"feedback_questions": string[]}}`,
  },
  tiktok: {
    instructions: `
Write a TikTok video concept and script.

Required fields inside "structured":
- hook: a 1-3 second spoken/on-screen hook (e.g. "I built an AI study battle app", "Can you try to break the app I built?", "Studying would be better if it felt like a game", "I turned my notes into an AI competition" -- write an original one in this style, don't reuse these verbatim).
- video_outline: a 15-30 second beat-by-beat outline.
- shot_list: array of screen-recording shots in order.
- voiceover_script: the full spoken voiceover, timed roughly to the outline.
- on_screen_text: array of text overlays in order.
- recommended_length_seconds: a number between 15 and 30.
- cover_text: short suggested cover/thumbnail text.
"body" should be the caption. "hashtags" should be 3-6 relevant hashtags (no more, hashtag-stuffing reads as spam on TikTok).
`.trim(),
    jsonShape: `{"title": null, "body": string, "hashtags": string[], "structured": {"hook": string, "video_outline": string, "shot_list": string[], "voiceover_script": string, "on_screen_text": string[], "recommended_length_seconds": number, "cover_text": string, "call_to_action": string}}`,
  },
  instagram: {
    instructions: `
Write an Instagram Reel concept.

Required fields inside "structured":
- reel_concept: one-paragraph concept.
- hook: short opening hook.
- shot_list: array of shots in order.
- story_text: short text suitable for an Instagram Story sticker/overlay.
- carousel_outline: array of slide-by-slide text if this were a carousel post instead (still provide it even if the primary format is a Reel).
"body" is the caption. "hashtags" should be 5-10 relevant hashtags.
`.trim(),
    jsonShape: `{"title": null, "body": string, "hashtags": string[], "structured": {"reel_concept": string, "hook": string, "shot_list": string[], "story_text": string, "carousel_outline": string[], "call_to_action": string}}`,
  },
  linkedin: {
    instructions: `
Write a LinkedIn post in first person, as the founder.

Structure:
- Strong opening line (not "I'm excited to announce").
- Brief student-founder story grounded only in the founder story/notes provided -- if no founder story was provided, keep this to one honest sentence about why you built it rather than inventing a backstory.
- The problem being solved.
- A plain-language explanation of what StudyClash is.
- One honest sentence on what you learned building it.
- A specific beta-testing request.
- A clear call to action.
"body" is the full post. "hashtags" should be 3-5 relevant, non-spammy hashtags.
`.trim(),
    jsonShape: `{"title": null, "body": string, "hashtags": string[], "structured": {}}`,
  },
  x: {
    instructions: `
Write X (Twitter) post variants.

Required fields inside "structured":
- primary_post: the main single post.
- alternative_post: a genuinely different angle, not a reword.
- thread: array of strings, each under 280 characters, forming a short thread version (3-6 posts).
- character_counts: {"primary_post": number, "alternative_post": number} -- the actual character count of each, so length can be validated without re-counting.
"body" should equal structured.primary_post. "hashtags" should be 0-2 (X posts with heavy hashtags read as spam/bot-like).
`.trim(),
    jsonShape: `{"title": null, "body": string, "hashtags": string[], "structured": {"primary_post": string, "alternative_post": string, "thread": string[], "character_counts": {"primary_post": number, "alternative_post": number}, "call_to_action": string}}`,
  },
  youtube_shorts: {
    instructions: `
Write a YouTube Shorts concept.

Required fields inside "structured":
- opening_hook: first 1-2 seconds.
- script: full 15-30 second script.
- shot_list: array of shots in order.
- recommended_length_seconds: number between 15 and 30.
"title" is the video title (under 100 characters). "body" is the video description. "hashtags" should be 3-6 relevant hashtags.
`.trim(),
    jsonShape: `{"title": string, "body": string, "hashtags": string[], "structured": {"opening_hook": string, "script": string, "shot_list": string[], "recommended_length_seconds": number, "call_to_action": string}}`,
  },
  saas_directory: {
    instructions: `
Write SaaS/startup directory submission answers.

Required fields inside "structured":
- one_sentence_description: exactly one sentence.
- category: a single suggested directory category.
- pricing_summary: plain-language pricing summary using only the pricing facts given.
- founder_description: one to two sentences about the founder, grounded only in facts given.
- product_stage: e.g. "Beta" -- use the beta_status fact given, don't invent a stage.
- screenshot_checklist: array of suggested screenshots to prepare.
- logo_checklist: array of logo requirements to double check before submitting.
"title" is the suggested tagline. "body" is the long-form description. "hashtags" should be an empty array (directories don't use hashtags).
`.trim(),
    jsonShape: `{"title": string, "body": string, "hashtags": [], "structured": {"one_sentence_description": string, "category": string, "pricing_summary": string, "founder_description": string, "product_stage": string, "screenshot_checklist": string[], "logo_checklist": string[]}}`,
  },
  beta_community: {
    instructions: `
Write a beta-testing community post/submission.

Required fields inside "structured":
- who_should_test: description of the ideal tester for this community.
- what_to_test: array of specific things to try.
- known_limitations: array of honest known limitations (use only what's implied by beta_status/notes -- if none given, write a generic honest line like "still in beta, rough edges expected" rather than inventing specifics).
- exact_feedback_requested: array of specific feedback questions.
- access_instructions: how to actually try it (sign up / try demo).
"title" is the post title. "body" is what StudyClash is, in plain terms, plus the product link placed naturally.
`.trim(),
    jsonShape: `{"title": string, "body": string, "hashtags": [], "structured": {"who_should_test": string, "what_to_test": string[], "known_limitations": string[], "exact_feedback_requested": string[], "access_instructions": string}}`,
  },
  school_community: {
    instructions: `
Write simple, student-friendly text for a school/student community (a club, a Discord, a class group chat, a tutoring center).

Explicitly avoid anything that sounds like an advertisement written by a company -- write like a student or a teacher/tutor sharing something genuinely useful, short sentences, no marketing buzzwords.

Required fields inside "structured": none needed beyond the base shape.
"body" must cover, in plain language: what StudyClash does, why a student might want to use it, how to try it, and what feedback is wanted.
"hashtags" should be an empty array.
`.trim(),
    jsonShape: `{"title": null, "body": string, "hashtags": [], "structured": {}}`,
  },
};

export function buildMarketingPrompt(args: {
  generatorType: GeneratorType;
  profile: MarketingProductProfile;
  campaign: MarketingCampaign;
  destination: MarketingDestination;
  trackingUrl: string;
  avoidBodies: string[];
}): string {
  const config = GENERATOR_CONFIGS[args.generatorType];
  const avoidBlock = args.avoidBodies.length
    ? `\nContent already generated for other destinations in this campaign (write something meaningfully different, not a reworded copy):\n${args.avoidBodies
        .map((body, index) => `--- Previous draft ${index + 1} ---\n${body.slice(0, 600)}`)
        .join("\n")}\n`
    : "";

  return `
You are drafting marketing/outreach content for StudyClash, written by its founder for their own review before posting anywhere. This is a real product with a real person behind it -- not a spam bot, not a content mill.

=== StudyClash facts (use ONLY these facts, never invent additional claims) ===
${profileFactsBlock(args.profile)}

=== Campaign ===
${campaignFactsBlock(args.campaign)}

=== Destination ===
${destinationFactsBlock(args.destination)}

Tracking link to include exactly once, naturally placed (not as a bare "click here" unless the destination format requires it): ${args.trackingUrl}
${avoidBlock}
${SHARED_GUARDRAILS}

=== Format-specific instructions ===
${config.instructions}

Return ONLY valid JSON in exactly this shape (no markdown fences, no commentary):
${config.jsonShape}
`.trim();
}
