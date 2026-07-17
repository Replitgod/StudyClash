import type { MarketingCampaign, MarketingDestination } from "./types";

export type DestinationRecommendation = {
  destination: MarketingDestination;
  relevanceScore: number;
  reasons: string[];
  risks: string[];
  publishingMethod: string;
  lastPostedDate: string | null;
  expectedAudience: string | null;
};

function daysSince(dateString: string | null): number | null {
  if (!dateString) return null;
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

// Scores + explains each destination for a given campaign. Deliberately
// simple and legible (not a black-box ML ranking) -- every point added or
// subtracted has a stated reason, shown to the admin alongside the score.
export function recommendDestinations(
  campaign: MarketingCampaign,
  destinations: MarketingDestination[]
): DestinationRecommendation[] {
  const audienceTokens = (campaign.target_audience || "").toLowerCase().split(/\W+/).filter(Boolean);

  const recommendations = destinations
    .filter((destination) => destination.active)
    .map((destination) => {
      let score = 0;
      const reasons: string[] = [];
      const risks: string[] = [];

      if (destination.best_campaign_goals.includes(campaign.goal)) {
        score += 40;
        reasons.push("Matches this campaign's goal directly.");
      }

      if (audienceTokens.length && destination.audience) {
        const destinationAudience = destination.audience.toLowerCase();
        const overlap = audienceTokens.filter((token) => token.length > 2 && destinationAudience.includes(token));
        if (overlap.length > 0) {
          score += Math.min(20, overlap.length * 7);
          reasons.push(`Audience overlaps on: ${overlap.join(", ")}.`);
        }
      }

      if (destination.posting_method === "official_api") {
        score += 5;
        reasons.push("Official API available (still requires your approval before publishing).");
      } else if (destination.posting_method === "unsupported") {
        score -= 10;
        risks.push("No supported posting method recorded yet.");
      }

      const cooldownDays = destination.reposting_cooldown_days;
      const sinceLastPost = daysSince(destination.last_posted_date);
      if (cooldownDays && sinceLastPost !== null) {
        if (sinceLastPost < cooldownDays) {
          const remaining = cooldownDays - sinceLastPost;
          score -= 30;
          risks.push(
            `Recently used ${sinceLastPost} day(s) ago -- this destination's cooldown is ${cooldownDays} days. Wait ${remaining} more day(s) before posting again.`
          );
        } else {
          reasons.push(`Cooldown cleared (last posted ${sinceLastPost} day(s) ago).`);
        }
      } else if (sinceLastPost !== null && sinceLastPost < 14) {
        risks.push(`Posted here ${sinceLastPost} day(s) ago -- no cooldown on file, but consider spacing out posts.`);
      }

      if (destination.self_promotion_allowed === false) {
        score -= 25;
        risks.push("This destination's rules mark self-promotion as NOT allowed -- read the community rules before posting.");
      } else if (destination.self_promotion_allowed === true) {
        reasons.push("Self-promotion is allowed here.");
      } else {
        risks.push("Self-promotion policy unknown -- verify the rules before posting.");
      }

      if (destination.allowed_promotion_days.length > 0) {
        risks.push(`Promotion only allowed on: ${destination.allowed_promotion_days.join(", ")}.`);
      }

      if (destination.manual_review_required) {
        risks.push("Manual review/submission required -- not an instant post.");
      }

      if (destination.best_posting_time) {
        reasons.push(`Best posting time (from your own research): ${destination.best_posting_time}.`);
      }

      if (destination.min_karma_or_reputation) {
        risks.push(`Requires minimum karma/reputation: ${destination.min_karma_or_reputation}.`);
      }

      const rulesAge = daysSince(destination.last_rules_review_date);
      if (rulesAge === null) {
        risks.push("Rules have never been manually verified for this destination -- verify before posting.");
      } else if (rulesAge > 90) {
        risks.push(`Rules were last verified ${rulesAge} days ago -- re-check before posting, community rules change.`);
      }

      return {
        destination,
        relevanceScore: Math.max(0, Math.min(100, score)),
        reasons: reasons.length ? reasons : ["General fit for this campaign goal."],
        risks,
        publishingMethod: destination.posting_method,
        lastPostedDate: destination.last_posted_date,
        expectedAudience: destination.audience,
      };
    });

  return recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
