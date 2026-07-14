// Canonical plan metadata — the single source of truth for every plan id
// StudyJoust recognizes, whether or not it's publicly sold on /pricing.
//
// This exists because /api/generate-questions previously hardcoded its own
// plan-id allowlist (FREE_PLAN_IDS/PRIORITY_PLAN_IDS) independently from the
// plan cards on /pricing, and the two drifted: "pro_preview" and "founder"
// were treated as valid priority plans by the API but had no corresponding
// entry anywhere on the pricing page, so a user on either plan saw no
// "Current Plan" badge at all. Both surfaces should read from here instead
// of maintaining their own list.

export type PlanId =
  | "free_beta"
  | "pro_individual"
  | "pro_preview"
  | "founder"
  | "team_pass"
  | "exam_tunnel";

export type PlanTier = "free" | "priority";

export type PlanMetadata = {
  id: PlanId;
  label: string;
  tagline: string;
  price: string;
  dailyLimit: string;
  features: string[];
  tier: PlanTier;
  // Whether this plan appears as a purchasable card on /pricing. Internal /
  // manually-granted plans (preview seats, founder access) still need to
  // resolve to a real label/badge anywhere a user's plan is displayed —
  // they're just not something a visitor can sign up for.
  publiclyListed: boolean;
  highlight?: boolean;
};

export const PLAN_METADATA: Record<PlanId, PlanMetadata> = {
  free_beta: {
    id: "free_beta",
    label: "Free Beta",
    tagline: "Everyone starts here",
    price: "$0",
    dailyLimit: "3 deck generations / day",
    features: [
      "AI-generated 15-question decks",
      "Up to 2 PDF uploads / day",
      "Up to 3 battles / day",
      "Paced quiz battles",
      "Leaderboards & challenge links",
      "Weak Topic Report",
    ],
    tier: "free",
    publiclyListed: true,
  },
  pro_individual: {
    id: "pro_individual",
    label: "Pro Premium",
    tagline: "Unlimited battles, full AI coaching",
    price: "$5/mo",
    dailyLimit: "Unlimited uploads and battles",
    features: [
      "Everything in Free Beta",
      "Priority generation queue",
      "Full VYRA deep-dive coaching",
      "Unlimited PDF/text uploads",
      "$49/year — 2 months free",
    ],
    tier: "priority",
    publiclyListed: true,
    highlight: true,
  },
  team_pass: {
    id: "team_pass",
    label: "Team/Guild Pass",
    tagline: "Free for small groups",
    price: "$0",
    dailyLimit: "Shared unlimited group usage",
    features: [
      "Private un-expiring leaderboards",
      "Collaborative deck building",
      "Custom group styling",
      "Up to 10 members per guild",
    ],
    tier: "priority",
    publiclyListed: true,
  },
  exam_tunnel: {
    id: "exam_tunnel",
    label: "High-Stakes Exam Tunnel",
    tagline: "Board-style prep for serious exam runs",
    price: "$9/mo",
    dailyLimit: "Premium board-style generation",
    features: [
      "AP, LSAT, MCAT & NCLEX-tuned question generation",
      "Passage- and case-linked question sets, not isolated facts",
      "VYRA coaching mapped to each exam's real objectives",
      "Priority generation queue during peak hours",
    ],
    tier: "priority",
    publiclyListed: true,
  },
  pro_preview: {
    id: "pro_preview",
    label: "Pro Preview",
    tagline: "Early-access preview seat, granted manually",
    price: "Invite-only",
    dailyLimit: "Unlimited uploads and battles",
    features: [
      "Everything in Pro Premium",
      "Early access to unreleased features",
    ],
    tier: "priority",
    publiclyListed: false,
  },
  founder: {
    id: "founder",
    label: "Founder",
    tagline: "Founding-team access",
    price: "Internal",
    dailyLimit: "Unlimited uploads and battles",
    features: ["Full unrestricted access to every plan feature"],
    tier: "priority",
    publiclyListed: false,
  },
};

export const ALL_PLANS: PlanMetadata[] = Object.values(PLAN_METADATA);

export const PUBLIC_PLANS: PlanMetadata[] = ALL_PLANS.filter(
  (plan) => plan.publiclyListed
);

// Typed as Set<string> (not Set<PlanId>) because callers check arbitrary,
// unvalidated `profile.plan` values (e.g. `PRIORITY_PLAN_IDS.has(activePlanId)`
// where activePlanId is a plain string read from the database) against these.
export const FREE_PLAN_IDS: Set<string> = new Set(
  ALL_PLANS.filter((plan) => plan.tier === "free").map((plan) => plan.id)
);

export const PRIORITY_PLAN_IDS: Set<string> = new Set(
  ALL_PLANS.filter((plan) => plan.tier === "priority").map((plan) => plan.id)
);

export function getPlanMetadata(planId: string | null | undefined): PlanMetadata | null {
  if (!planId) return null;
  return PLAN_METADATA[planId as PlanId] || null;
}

export function isKnownPlanId(planId: string | null | undefined): planId is PlanId {
  return !!planId && planId in PLAN_METADATA;
}
