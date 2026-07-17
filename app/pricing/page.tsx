"use client";

import { useAuth } from "@/lib/useAuth";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { PLAN_METADATA, PUBLIC_PLANS, getPlanMetadata } from "@/lib/plans";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";
import { Button } from "@/app/components/ui/Button";
import { HoverLiftArticle } from "@/app/components/ui/HoverLift";

const PLANS = PUBLIC_PLANS;

export default function PricingPage() {
  const { profile, isLoggedIn } = useAuth();

  // A user can be on a plan that isn't publicly sold (e.g. a manually
  // granted "pro_preview"/"founder" seat) — surface that clearly instead of
  // silently showing no "Current Plan" badge anywhere on this page.
  const currentPlanMeta = getPlanMetadata(profile?.plan);
  const isOnUnlistedPlan =
    isLoggedIn && currentPlanMeta !== null && !currentPlanMeta.publiclyListed;

  const requestAccessHref =
    "mailto:studyjoustbeta@gmail.com?subject=StudyClash%20Plan%20Access%20Request";

  // No payment processor is wired up yet -- these plans aren't purchasable
  // with a working checkout, so the button says exactly that instead of
  // implying a live "Buy Now" flow. Clicking sends a plan-access request by
  // email rather than landing on a broken checkout page.
  const getButtonLabel = (planId: string): string => {
    if (isLoggedIn && profile?.plan === planId) {
      return "Current Plan";
    }
    if (planId === "free_beta") {
      return "Current Beta";
    }
    return "Join Waitlist";
  };

  const isCurrentPlan = (planId: string): boolean => {
    return isLoggedIn && profile?.plan === planId;
  };

  const getPlanHref = (planId: string): string => {
    if (planId === "free_beta") {
      return isLoggedIn ? "/create" : "/signup?redirect=/create";
    }

    if (planId === "exam_tunnel") {
      return "/exams";
    }

    if (isLoggedIn) {
      return requestAccessHref;
    }

    return `/signup?redirect=${encodeURIComponent("/pricing")}`;
  };

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center px-4 py-14 sm:px-6 sm:py-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-indigo-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          SIMPLE PRICING
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            Membership Plans
          </span>
        </h1>
        <p className="mt-3 max-w-lg text-center text-sm text-white/50 sm:text-base">
          {FREE_PLAN_LIMIT_SUMMARY}
        </p>

        {isOnUnlistedPlan && currentPlanMeta && (
          <div className="mt-6 flex w-full max-w-lg items-center gap-3 rounded-2xl border border-green-400/25 bg-green-500/10 px-4 py-3 text-left sm:px-5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 text-sm font-black text-green-300">
              ✓
            </span>
            <p className="text-sm text-green-100/90">
              You&apos;re on the <span className="font-bold">{currentPlanMeta.label}</span> plan
              ({currentPlanMeta.tagline.toLowerCase()}) — not publicly listed below, but fully active on your account.
            </p>
          </div>
        )}

        {/* Plan cards */}
        <div className="mt-10 grid w-full grid-cols-1 gap-5 sm:mt-12 md:grid-cols-3">
          {PLANS.map((plan) => {
            const current = isCurrentPlan(plan.id);

            return (
              <HoverLiftArticle
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-5 backdrop-blur-sm sm:p-6 ${
                  plan.highlight
                    ? "border-indigo-400/40 bg-gradient-to-b from-indigo-500/10 to-white/[0.03] shadow-[0_0_50px_-15px_rgba(79,70,229,0.5)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_0_20px_-5px_rgba(79,70,229,0.7)]">
                    Most Popular
                  </span>
                )}

                {current && (
                  <span className="absolute -top-3 right-4 rounded-full bg-green-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-green-300">
                    Your Plan
                  </span>
                )}

                {/* Plan name + tagline */}
                <div className="text-center">
                  <h2 className="text-lg font-black tracking-tight sm:text-xl">
                    {plan.label}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">{plan.tagline}</p>
                </div>

                {/* Price */}
                <div className="mt-5 text-center">
                  <span className="text-4xl font-black text-white sm:text-5xl">
                    {plan.price}
                  </span>
                </div>

                {/* Daily limit */}
                <div className="mt-5 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center">
                  <p className="text-sm font-bold text-indigo-300">
                    {plan.dailyLimit}
                  </p>
                </div>

                {/* Features */}
                <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-white/70"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      <span className="break-words">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                {current ? (
                  <div className="mt-6 flex w-full items-center justify-center rounded-xl border border-green-400/30 bg-green-500/10 px-6 py-3.5 text-sm font-bold text-green-300">
                    {getButtonLabel(plan.id)}
                  </div>
                ) : plan.id === "free_beta" || !isLoggedIn ? (
                  <Button href={getPlanHref(plan.id)} variant={plan.highlight ? "primary" : "ghost"} fullWidth className="mt-6">
                    {getButtonLabel(plan.id)}
                  </Button>
                ) : (
                  <Button
                    href={getPlanHref(plan.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant={plan.highlight ? "primary" : "ghost"}
                    fullWidth
                    className="mt-6"
                  >
                    {getButtonLabel(plan.id)}
                  </Button>
                )}
              </HoverLiftArticle>
            );
          })}
        </div>

        {/* Bottom note */}
        <div className="mt-10 flex w-full max-w-2xl flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center backdrop-blur-sm sm:mt-12 sm:p-6">
          <p className="text-sm font-semibold text-white/80">
            Core battles stay free
          </p>
          <p className="text-xs text-white/40">
            {FREE_PLAN_LIMIT_SUMMARY} {PLAN_METADATA.pro_individual.label} also unlocks the full VYRA coach.
          </p>
          {!isLoggedIn && (
            <Button href="/signup" variant="primary" className="mt-3">
              Sign Up for Free
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}