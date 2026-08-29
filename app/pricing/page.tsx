"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { PUBLIC_TIERS, TIERS, type Tier } from "@/lib/tiers";
import { Reveal } from "@/app/components/marketing/Reveal";
import { SiteFooter } from "@/app/components/marketing/SiteFooter";

// Pricing.
//
// Every price on this page reads from lib/tiers.ts, which is the same
// module the billing governor enforces and the same one that carries the
// amount in cents for Stripe. Before this, the plan cards and the upgrade
// button were separate literals and had already drifted -- the CTA offered
// Pro at "$3/month" while the plan card said something else.

const FAQ = [
  {
    q: "What happens when I hit the free limit?",
    a: "Nothing you have already made goes away. You keep every map, card and score you have built; you just cannot create a fourth map until the month rolls over, or until you upgrade.",
  },
  {
    q: "Can I cancel Ace Pro?",
    a: "Any time, from Settings. You keep Pro until the end of the period you have paid for, and your maps stay readable afterwards on the free tier.",
  },
  {
    q: "What is Card Crack?",
    a: "When you get something wrong, it names the exact misconception behind the option you picked, the idea underneath it, how to spot the trap next time, and a follow-up question that repairs the gap.",
  },
  {
    q: "Is Classroom per teacher or per student?",
    a: "Per class. One price covers the roster, shared knowledge maps, and collective decay tracking so a teacher can see what the whole group is losing.",
  },
];

export default function PricingPage() {
  const { profile, isLoggedIn } = useAuth();

  const [checkoutCancelled, setCheckoutCancelled] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutAvailable, setIsCheckoutAvailable] = useState(false);

  useEffect(() => {
    void trackEvent("pricing_viewed");
  }, []);

  // Read off window.location rather than useSearchParams so this page does
  // not need a Suspense boundary just to show a dismissable banner.
  useEffect(() => {
    setCheckoutCancelled(
      new URLSearchParams(window.location.search).get("checkout") === "cancelled"
    );
  }, []);

  // Stripe stays in test mode until the live key is set, so checkout is
  // hidden rather than offered and then failing. Defaults to false so the
  // button never flashes visible before this resolves.
  useEffect(() => {
    if (!isLoggedIn) return;
    authFetch("/api/stripe/checkout")
      .then((response) => response.json())
      .then((data) => setIsCheckoutAvailable(!!data.available))
      .catch(() => setIsCheckoutAvailable(false));
  }, [isLoggedIn]);

  const startCheckout = useCallback(async () => {
    setCheckoutError(null);
    setIsStartingCheckout(true);
    void trackEvent("checkout_started", { source: "pricing" });

    try {
      const response = await authFetch("/api/stripe/checkout", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) {
        setCheckoutError(data.error || "Could not start checkout. Please try again.");
        setIsStartingCheckout(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Could not start checkout. Please try again.");
      setIsStartingCheckout(false);
    }
  }, []);

  const track = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  const currentTierId = profile?.plan === "pro_individual" ? "pro" : "free";

  function renderCta(tier: Tier) {
    if (isLoggedIn && currentTierId === tier.id) {
      return (
        <span className="btn btn-lg btn-ghost w-full" aria-current="true">
          Your plan
        </span>
      );
    }

    if (tier.id === "free") {
      return (
        <Link
          href={isLoggedIn ? "/home" : "/signup"}
          className="btn btn-lg btn-ghost w-full"
        >
          {isLoggedIn ? "Open AceDecks" : "Start free"}
        </Link>
      );
    }

    if (tier.id === "classroom") {
      return (
        <Link href="/contact?plan=classroom" className="btn btn-lg btn-ghost w-full">
          Talk to us
        </Link>
      );
    }

    // Pro.
    if (!isLoggedIn) {
      return (
        <Link
          href={`/signup?redirect=${encodeURIComponent("/pricing")}`}
          className="btn btn-lg btn-accent w-full"
        >
          Get Ace Pro — {TIERS.pro.price}
        </Link>
      );
    }

    if (!isCheckoutAvailable) {
      // Honest rather than a button that fails: checkout genuinely is not
      // open yet on this deployment.
      return (
        <span
          className="btn btn-lg btn-ghost w-full cursor-default"
          style={{ opacity: 0.6 }}
        >
          Opening soon
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={startCheckout}
        disabled={isStartingCheckout}
        className="btn btn-lg btn-accent w-full"
      >
        {isStartingCheckout ? "Starting checkout…" : `Get Ace Pro — ${TIERS.pro.price}`}
      </button>
    );
  }

  return (
    <>
      <main
        className="relative overflow-hidden"
        style={{ background: "var(--void)", color: "var(--text-1)" }}
      >
        <div className="grid-bg" aria-hidden="true" />
        <div
          className="halo left-1/2 top-[-12%] h-[40rem] w-[40rem] -translate-x-1/2"
          aria-hidden="true"
          style={{ background: "rgb(124 106 240 / 0.16)" }}
        />

        <div className="shell relative pb-[clamp(4rem,8vw,6rem)] pt-[clamp(4rem,9vw,7rem)]">
          <Reveal>
            <p className="eyebrow text-center">Pricing</p>
            <h1 className="headline-xl mx-auto mt-5 text-center text-[clamp(2.25rem,5.6vw,3.75rem)]">
              <span className="text-sheen">Free to prove it.</span>
              <br />
              <span className="text-accent-sheen">{TIERS.pro.price} to live in it.</span>
            </h1>
            <p className="lede mx-auto mt-6 text-center">
              Start free on your own notes. Upgrade when the cap starts costing
              you more than the subscription.
            </p>
          </Reveal>

          {checkoutCancelled && (
            <Reveal>
              <p
                role="status"
                className="mx-auto mt-8 max-w-md rounded-[12px] border px-4 py-3 text-center text-[14px]"
                style={{
                  borderColor: "rgb(255 176 32 / 0.3)",
                  background: "rgb(255 176 32 / 0.1)",
                  color: "#ffc861",
                }}
              >
                Checkout was cancelled. Nothing was charged.
              </p>
            </Reveal>
          )}

          {checkoutError && (
            <Reveal>
              <p
                role="alert"
                className="mx-auto mt-8 max-w-md rounded-[12px] border px-4 py-3 text-center text-[14px]"
                style={{
                  borderColor: "rgb(244 63 94 / 0.35)",
                  background: "rgb(244 63 94 / 0.1)",
                  color: "#ff8fa3",
                }}
              >
                {checkoutError}
              </p>
            </Reveal>
          )}

          <Reveal delay={120}>
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {PUBLIC_TIERS.map((tier) => {
                const featured = tier.id === "pro";
                return (
                  <article
                    key={tier.id}
                    onPointerMove={track}
                    className="bento p-7"
                    style={
                      featured
                        ? {
                            borderColor: "var(--accent-line)",
                            boxShadow: "0 0 60px -26px rgb(124 106 240 / 0.7)",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2
                        className="text-[17px] font-semibold tracking-[-0.02em]"
                        style={{ color: "var(--text-1)" }}
                      >
                        {tier.label}
                      </h2>
                      {featured && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            background: "var(--accent-soft)",
                            border: "1px solid var(--accent-line)",
                            color: "var(--accent-bright)",
                          }}
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          Most picked
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-baseline gap-2">
                      <span
                        className="text-[40px] font-semibold leading-none tracking-[-0.04em]"
                        style={{ color: "var(--text-1)" }}
                      >
                        {tier.price}
                      </span>
                      <span className="text-[13px]" style={{ color: "var(--text-3)" }}>
                        {tier.period}
                      </span>
                    </div>

                    <p
                      className="mt-3 text-[14px] leading-relaxed"
                      style={{ color: "var(--text-2)" }}
                    >
                      {tier.tagline}
                    </p>

                    <ul className="mt-6 flex flex-col gap-2.5">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            className="mt-0.5 h-4 w-4 flex-none"
                            style={{
                              color: featured ? "var(--accent-bright)" : "var(--text-3)",
                            }}
                            aria-hidden="true"
                          />
                          <span className="text-[14px]" style={{ color: "var(--text-2)" }}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* mt-auto keeps every CTA on the same baseline however
                        many features a tier lists. */}
                    <div className="mt-auto pt-8">{renderCta(tier)}</div>
                  </article>
                );
              })}
            </div>
          </Reveal>
        </div>

        <hr className="hairline" />

        <section aria-labelledby="pricing-faq" className="section">
          <div className="shell">
            <Reveal>
              <h2
                id="pricing-faq"
                className="headline-lg text-[clamp(1.75rem,3.6vw,2.5rem)]"
              >
                <span className="text-sheen">Before you ask.</span>
              </h2>
            </Reveal>
            <div className="mt-8 max-w-3xl">
              {FAQ.map((item, index) => (
                <Reveal key={item.q} delay={index * 60}>
                  <details
                    className="group border-b py-5"
                    style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
                  >
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-medium transition-colors group-hover:text-[var(--accent-bright)]"
                      style={{ color: "var(--text-1)" }}
                    >
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-full border transition-transform duration-300 group-open:rotate-45"
                        style={{ borderColor: "var(--accent-line)" }}
                      >
                        <svg
                          viewBox="0 0 14 14"
                          className="h-3 w-3"
                          fill="none"
                          stroke="var(--accent-bright)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <path d="M7 1.5v11M1.5 7h11" />
                        </svg>
                      </span>
                    </summary>
                    <p
                      className="mt-3.5 max-w-2xl text-[15px] leading-relaxed"
                      style={{ color: "var(--text-2)" }}
                    >
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
