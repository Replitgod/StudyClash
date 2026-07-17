// Canonical plan metadata — the single source of truth for every plan id
// StudyClash recognizes, whether or not it's publicly sold on /pricing.
//
// This exists because /api/generate-questions previously hardcoded its own
// plan-id allowlist (FREE_PLAN_IDS/PRIORITY_PLAN_IDS) independently from the
// plan cards on /pricing, and the two drifted: "pro_preview" and "founder"
// were treated as valid priority plans by the API but had no corresponding
// entry anywhere on the pricing page, so a user on either plan saw no
// "Current Plan" badge at all. Both surfaces should read from here instead
// of maintaining their own list.
//
// free_beta.dailyLimit reads from lib/planLimits.ts (the actual enforced
// numbers in app/api/generate-questions/route.ts) rather than a hand-typed
// string, so this label can't drift from what's really enforced again.

import { FREE_PLAN_LIMIT_SHORT } from "./planLimits";

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
    label: "Free",
    tagline: "Everyone starts here",
    price: "$0",
    dailyLimit: FREE_PLAN_LIMIT_SHORT,
    features: [
      "Demo battles",
      "Limited deck creation",
      "Basic results",
      "Friend challenges",
    ],
    tier: "free",
    publiclyListed: true,
  },
  pro_individual: {
    id: "pro_individual",
    label: "StudyClash Pro",
    tagline: "For students who want the full loop",
    price: "$3/mo",
    dailyLimit: "Unlimited uploads and battles",
    features: [
      "More deck generations",
      "Full weak-topic reports",
      "Targeted rematches",
      "Saved study history",
      "Advanced AI explanations",
      "Full diagnostic tests and exam tunnels (AP, MCAT, LSAT, NCLEX)",
      "Personalized exam plans",
      "Skill-by-skill tracking",
      "Long-term progress analysis",
    ],
    tier: "priority",
    publiclyListed: true,
    highlight: true,
  },
  team_pass: {
    id: "team_pass",
    label: "Team/Guild Pass",
    tagline: "Free during the pilot",
    price: "$0",
    dailyLimit: "Shared unlimited group usage",
    features: [
      "Private un-expiring leaderboards",
      "Collaborative deck building",
      "Custom group styling",
      "Up to 10 members per guild",
    ],
    tier: "priority",
    // Not one of the three plans on the public pricing page (see the
    // "PRIORITY 2" pricing spec) -- kept fully defined and resolvable for
    // any account already on it, just not advertised as a purchasable card.
    publiclyListed: false,
  },
  // No longer sold on its own -- every feature that used to be exclusive to
  // Exam Pro is now bundled into pro_individual (StudyClash Pro, $3/mo), and
  // Stripe checkout only ever creates pro_individual subscriptions. This id
  // is kept, unlisted, purely so any account still on it from before the
  // merge keeps resolving to a real label/tier instead of showing nothing.
  exam_tunnel: {
    id: "exam_tunnel",
    label: "StudyClash Pro",
    tagline: "Full diagnostics and long-term tracking",
    price: "$3/mo",
    dailyLimit: "Premium board-style generation",
    features: [
      "Everything in StudyClash Pro",
      "Full diagnostic tests",
      "Personalized exam plans",
      "Skill-by-skill tracking",
      "Long-term progress analysis",
    ],
    tier: "priority",
    publiclyListed: false,
  },
  pro_preview: {
    id: "pro_preview",
    label: "Pro Preview",
    tagline: "Early-access preview seat, granted manually",
    price: "Invite-only",
    dailyLimit: "Unlimited uploads and battles",
    features: [
      "Everything in Student Pro",
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
