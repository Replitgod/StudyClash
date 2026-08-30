"use client";

import { useCallback } from "react";
import Link from "next/link";
import { OrbitalMap } from "@/app/components/marketing/OrbitalMap";
import { StepGrid } from "@/app/components/marketing/StepGrid";
import { CardArena } from "@/app/components/marketing/CardArena";
import { Reveal } from "@/app/components/marketing/Reveal";
import { MagneticButton } from "@/app/components/motion/MagneticButton";
import { LogoMark } from "@/app/components/brand/Logo";
import { HeroPanel } from "@/app/components/marketing/HeroPanel";
import { FAQ_ITEMS } from "@/app/components/marketing/faq";

// The landing page.
//
// Built to the restraint of Linear/Vercel rather than to a showreel: one
// accent colour, one card treatment, one section rhythm, and depth that
// comes from light rather than from borders. The two interactive pieces --
// the decaying knowledge map and the arena card -- are the only places the
// page raises its voice, because they are the only places it has something
// to demonstrate rather than describe.
//
// Every heading is line-length clamped (`.headline-xl` / `.headline-lg` cap at
// 18-22ch) so nothing stretches into a thin ribbon on a wide monitor, which
// is the fastest way a landing page stops looking designed.

export function NeonLanding() {
  const track = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div
      className="relative overflow-x-clip"
      style={{ background: "var(--void)", color: "var(--text-1)" }}
    >
      {/* ============================= HERO ============================= */}
      <header className="relative overflow-hidden">
        <div className="grid-bg" aria-hidden="true" />
        <div
          className="halo left-1/2 top-[-14%] h-[46rem] w-[46rem] -translate-x-1/2"
          aria-hidden="true"
          style={{ background: "rgb(124 106 240 / 0.16)" }}
        />
        <div
          className="halo left-[6%] top-[38%] h-[26rem] w-[26rem]"
          aria-hidden="true"
          style={{ background: "rgb(52 227 155 / 0.07)" }}
        />

        <div className="shell relative pb-[clamp(5rem,10vw,8rem)] pt-[clamp(5rem,10vw,8rem)]">
          <div className="grid items-center gap-16 lg:grid-cols-[1.06fr_0.94fr]">
            <div>
          {/* The offer pill lives in the header now; repeating it here made
              the same seven words appear twice above the fold. */}
          <Reveal delay={80}>
            <h1 className="headline-xl text-[clamp(2.75rem,7.4vw,5.25rem)]">
              <span className="text-sheen">Stop deciding</span>
              <br />
              <span className="text-accent-sheen">what to study.</span>
            </h1>
          </Reveal>

          <Reveal delay={150}>
            <p className="lede mt-7">
              AceDecks reads your notes, finds the concepts you are quietly
              losing, and drills them back before an exam finds them first.
            </p>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <MagneticButton
                href="/signup"
                className="btn btn-lg btn-accent"
                ariaLabel="Start studying free"
              >
                <span className="font-semibold">Start studying free</span>
              </MagneticButton>
              <Link href="/login" className="btn btn-lg btn-ghost">
                I have an account
              </Link>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-3">
              {[
                ["~20s", "Notes to first question"],
                ["Every miss", "Explained, then retested"],
                ["Free", "3 maps a month, no card"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt
                    className="text-[19px] font-semibold tracking-[-0.02em]"
                    style={{ color: "var(--text-1)" }}
                  >
                    {value}
                  </dt>
                  <dd
                    className="mt-1 text-[13px] leading-snug"
                    style={{ color: "var(--text-3)" }}
                  >
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
            </div>

            <Reveal delay={200} className="flex justify-center lg:justify-end">
              <HeroPanel />
            </Reveal>
          </div>
        </div>

        <hr className="hairline" />
      </header>

      {/* ====================== LIVE KNOWLEDGE MAP ====================== */}
      <section aria-labelledby="map" className="section relative overflow-hidden">
        <div
          className="halo right-[-6%] top-[16%] h-[32rem] w-[32rem]"
          aria-hidden="true"
          style={{ background: "rgb(124 106 240 / 0.12)" }}
        />

        <div className="shell relative">
          <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <Reveal>
                <p className="eyebrow">Live knowledge map</p>
                <h2
                  id="map"
                  className="headline-lg mt-5 text-[clamp(2rem,4.6vw,3.25rem)]"
                >
                  <span className="text-sheen">Watch a concept</span>
                  <br />
                  <span className="text-accent-sheen">drift away.</span>
                </h2>
              </Reveal>

              <Reveal delay={90}>
                <p className="lede mt-7">
                  This is not a loop. The fading nodes are genuinely decaying
                  as you read — dimming, flickering and orbiting further out
                  the longer they go untouched.
                </p>
              </Reveal>

              <Reveal delay={150}>
                <ul className="mt-8 flex flex-col gap-3.5">
                  {[
                    "Forgetting is modelled, not guessed",
                    "Weak concepts surface before an exam finds them",
                    "One click runs the repair and snaps it home",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full"
                        style={{
                          background: "var(--accent)",
                          boxShadow: "0 0 10px var(--accent)",
                        }}
                      />
                      <span
                        className="text-[15px] leading-relaxed"
                        style={{ color: "var(--text-2)" }}
                      >
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="bento p-5 sm:p-6" onPointerMove={track}>
                <OrbitalMap />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="hairline" />

      {/* ========================== FOUR STEPS ========================== */}
      <section aria-labelledby="loop" className="section relative overflow-hidden">
        <div className="shell relative">
          <Reveal>
            <p className="eyebrow">The loop</p>
            <h2 id="loop" className="headline-lg mt-5 text-[clamp(2rem,4.6vw,3.25rem)]">
              <span className="text-sheen">Four steps, and you pick</span>
              <br />
              <span className="text-accent-sheen">none of them.</span>
            </h2>
            <p className="lede mt-7">
              You never build a study plan, choose a mode, or decide what is
              due. The engine does all four, every session.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-14">
              <StepGrid />
            </div>
          </Reveal>
        </div>
      </section>

      <hr className="hairline" />

      {/* ============================ ARENA ============================= */}
      <section aria-labelledby="arena" className="section relative overflow-hidden">
        <div
          className="halo left-[-4%] top-[24%] h-[30rem] w-[30rem]"
          aria-hidden="true"
          style={{ background: "rgb(124 106 240 / 0.13)" }}
        />

        <div className="shell relative">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <Reveal>
                <p className="eyebrow">The arena</p>
                <h2
                  id="arena"
                  className="headline-lg mt-5 text-[clamp(2rem,4.6vw,3.25rem)]"
                >
                  <span className="text-sheen">Get it wrong.</span>
                  <br />
                  <span className="text-accent-sheen">On purpose.</span>
                </h2>
              </Reveal>

              <Reveal delay={90}>
                <p className="lede mt-7">
                  Pick the wrong answer and the card cracks open into exactly
                  what the app gives you: the misconception, the idea
                  underneath it, and how to spot it next time.
                </p>
              </Reveal>

              <Reveal delay={150}>
                <p className="mt-6 text-[13px]" style={{ color: "var(--text-4)" }}>
                  Go on — pick the wrong one.
                </p>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <CardArena />
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="hairline" />

      {/* ============================= FAQ ============================== */}
      <section aria-labelledby="faq" className="section relative">
        <div className="shell">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <Reveal>
              <p className="eyebrow">Questions</p>
              <h2 id="faq" className="headline-lg mt-5 text-[clamp(1.9rem,4vw,2.75rem)]">
                <span className="text-sheen">Short answers.</span>
              </h2>
            </Reveal>

            <div>
              {FAQ_ITEMS.map((item, index) => (
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
        </div>
      </section>

      {/* ============================ CLOSE ============================= */}
      <section aria-label="Get started" className="relative overflow-hidden">
        <div className="shell relative pb-[clamp(6rem,12vw,9rem)] pt-[clamp(5rem,10vw,8rem)]">
          <div
            className="bento relative overflow-hidden px-6 py-16 text-center sm:px-12 sm:py-20"
            onPointerMove={track}
          >
            <div className="grid-bg" aria-hidden="true" />
            <div
              className="halo left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
              style={{ background: "rgb(124 106 240 / 0.18)" }}
            />

            <Reveal>
              <div className="relative">
                <LogoMark className="mx-auto h-12 w-12" idPrefix="close" />
                <h2 className="headline-lg mx-auto mt-8 text-[clamp(2rem,5vw,3.4rem)]">
                  <span className="text-sheen">What are you</span>
                  <br />
                  <span className="text-accent-sheen">studying?</span>
                </h2>
                <p className="lede mx-auto mt-5 text-center">
                  Type it in and you will have your first question about twenty
                  seconds later.
                </p>
                <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <MagneticButton
                    href="/signup"
                    className="btn btn-lg btn-accent"
                    ariaLabel="Start studying free"
                  >
                    <span className="font-semibold">Start studying free</span>
                  </MagneticButton>
                  <Link href="/pricing" className="btn btn-lg btn-ghost">
                    See pricing
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
