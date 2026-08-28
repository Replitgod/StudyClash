"use client";

import Link from "next/link";
import { GlassOrb } from "@/app/components/marketing/GlassOrb";
import { OrbitalMap } from "@/app/components/marketing/OrbitalMap";
import { ServerRack } from "@/app/components/marketing/ServerRack";
import { CardArena } from "@/app/components/marketing/CardArena";
import { ScannerCursor } from "@/app/components/marketing/ScannerCursor";
import { FilmGrain } from "@/app/components/marketing/FilmGrain";
import { ReactiveHeading } from "@/app/components/marketing/ReactiveHeading";
import { Reveal } from "@/app/components/marketing/Reveal";
import { MagneticButton } from "@/app/components/motion/MagneticButton";
import { LogoMark } from "@/app/components/brand/Logo";

// The public landing experience.
//
// Ordered so the page argues rather than lists: the hero states the
// promise, the orbital map shows the problem happening live, the rack
// explains the machine that fixes it, and the card lets you feel the fix.

const FAQ_ITEMS = [
  {
    q: "What does it cost?",
    a: "Nothing. Every feature is free and unlimited — no daily caps, no locked modes, no card required.",
  },
  {
    q: "Do I need to have notes?",
    a: "No. Type what you are studying — a topic like “photosynthesis” or “AP World Unit 3” — and AceDecks writes the study material for you.",
  },
  {
    q: "What can I upload?",
    a: "PDFs, photos of a textbook or your own handwriting, and plain text. You can also import a Quizlet set, an Anki deck, or a Google Doc.",
  },
  {
    q: "How does it know what I am bad at?",
    a: "Every answer feeds a mastery model that weighs how recently you answered, how hard the question was, how long you took, and how much has decayed since. Miss something and it comes back sooner; prove it and it comes back much later.",
  },
  {
    q: "Is it actually different from Quizlet?",
    a: "Quizlet holds your flashcards. AceDecks decides what you practise next, and tells you why. You never build a study plan or pick a mode.",
  },
];

export function NeonLanding() {
  return (
    <div
      className="relative overflow-x-clip"
      style={{ background: "var(--void)", color: "var(--text-1)" }}
    >
      <ScannerCursor />
      <FilmGrain />

      {/* ============================ HERO ============================ */}
      <header className="relative h-[130vh]">
        <div className="sticky top-0 h-dvh overflow-hidden">
          <GlassOrb />

          {/* Ambient light */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="tech-grid absolute inset-0 opacity-40" />
            <div
              className="absolute bottom-[-25%] left-[8%] h-[52vw] w-[52vw] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(0 255 102 / 0.13) 0%, transparent 65%)",
                filter: "blur(80px)",
              }}
            />
          </div>

          {/* Copy sits below the orb, out of its way */}
          <div className="relative z-20 flex h-full flex-col justify-end pb-[12vh]">
            <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
              <h1 className="sr-only">Stop deciding what to study.</h1>

              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  border: "1px solid rgb(0 255 102 / 0.35)",
                  background: "rgb(0 255 102 / 0.07)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--neon-green)" }}
                  aria-hidden="true"
                />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--neon-green)" }}
                >
                  Free · unlimited · no card
                </span>
              </div>

              <p
                className="mt-6 max-w-xl text-[16px] leading-relaxed sm:text-[18px]"
                style={{ color: "var(--text-2)" }}
              >
                AceDecks reads your notes, finds the concepts you are quietly
                losing, and drills them back before an exam finds them first.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <MagneticButton
                  href="/signup"
                  className="btn btn-lg box-glow-green"
                  ariaLabel="Start studying free"
                >
                  <span
                    className="font-semibold uppercase tracking-[0.1em]"
                    style={{ color: "var(--neon-green)" }}
                  >
                    Start studying free
                  </span>
                </MagneticButton>
                <Link
                  href="/login"
                  className="btn btn-lg"
                  style={{
                    border: "1px solid rgb(255 255 255 / 0.16)",
                    color: "var(--text-1)",
                  }}
                >
                  I have an account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ====================== ORBITAL DECAY ========================= */}
      <section
        aria-labelledby="decay"
        className="relative border-y py-24 sm:py-32"
        style={{
          borderColor: "rgb(255 255 255 / 0.07)",
          background: "var(--void-raised)",
        }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr]">
          <Reveal>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.26em]"
              style={{ color: "var(--neon-decay)" }}
            >
              Live knowledge map
            </p>
            <ReactiveHeading
              id="decay"
              className="mt-4 text-[clamp(2.2rem,5.6vw,4.4rem)]"
              restWidth={96}
              style={{ color: "var(--text-1)" }}
            >
              Watch it
              <br />
              <span className="glow-decay" style={{ color: "var(--neon-decay)" }}>
                drift away.
              </span>
            </ReactiveHeading>

            <p
              className="mt-6 max-w-md text-[16px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              This is not a loop. The magenta nodes are genuinely decaying
              while you read — dimming, flickering and orbiting further out
              the longer they go untouched. Click one and watch the repair
              snap it home.
            </p>
            <p className="mt-4 text-[13px]" style={{ color: "var(--text-4)" }}>
              That is the whole product, running on a page you have not signed
              into.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <OrbitalMap />
          </Reveal>
        </div>
      </section>

      {/* ========================= SERVER RACK ======================== */}
      <ServerRack />

      {/* ========================== FLASHCARD ========================= */}
      <section
        aria-labelledby="arena"
        className="relative border-t py-24 sm:py-32"
        style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.26em]"
              style={{ color: "var(--neon-green)" }}
            >
              The arena
            </p>
            <ReactiveHeading
              id="arena"
              className="mt-4 text-[clamp(2.2rem,5.6vw,4.4rem)]"
              restWidth={96}
              style={{ color: "var(--text-1)" }}
            >
              Get it wrong.
              <br />
              <span className="glow-blue" style={{ color: "var(--neon-blue)" }}>
                On purpose.
              </span>
            </ReactiveHeading>
            <p
              className="mt-6 max-w-md text-[16px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              Pick the wrong answer and the card takes the hit, then cracks
              open into exactly what the app gives you: the misconception, the
              idea underneath it, and how to spot it next time.
            </p>
            <p className="mt-5 text-[13px]" style={{ color: "var(--text-4)" }}>
              Go on. Pick the wrong one.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <CardArena />
          </Reveal>
        </div>
      </section>

      {/* ============================ FAQ ============================= */}
      <section
        aria-labelledby="faq"
        className="relative border-t py-24 sm:py-32"
        style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
          <Reveal>
            <ReactiveHeading
              id="faq"
              className="text-[clamp(2rem,5vw,3.6rem)]"
              restWidth={96}
              style={{ color: "var(--text-1)" }}
            >
              Short answers.
            </ReactiveHeading>
          </Reveal>

          <div className="mt-10">
            {FAQ_ITEMS.map((item, index) => (
              <Reveal key={item.q} delay={index * 60}>
                <details
                  className="group border-b py-5"
                  style={{ borderColor: "rgb(255 255 255 / 0.08)" }}
                >
                  <summary
                    data-cursor="Open"
                    className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16.5px] font-medium"
                    style={{ color: "var(--text-1)" }}
                  >
                    {item.q}
                    <span
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full border transition-transform duration-300 group-open:rotate-45"
                      style={{ borderColor: "rgb(0 255 102 / 0.4)" }}
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 14 14"
                        className="h-3 w-3"
                        fill="none"
                        stroke="var(--neon-green)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M7 1.5v11M1.5 7h11" />
                      </svg>
                    </span>
                  </summary>
                  <p
                    className="mt-4 max-w-2xl text-[15.5px] leading-relaxed"
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

      {/* =========================== CLOSE ============================ */}
      <section
        aria-label="Get started"
        className="relative overflow-hidden border-t py-28 text-center sm:py-36"
        style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
      >
        <div className="tech-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div
          className="absolute left-1/2 top-1/2 h-[62vw] w-[62vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          aria-hidden="true"
          style={{
            background: "radial-gradient(circle, rgb(0 255 102 / 0.12), transparent 62%)",
            filter: "blur(80px)",
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8">
          <Reveal>
            <LogoMark className="mx-auto h-14 w-14" idPrefix="neon-close" />
            <ReactiveHeading
              className="mt-8 text-[clamp(2.4rem,7vw,5rem)]"
              restWidth={98}
              style={{ color: "var(--text-1)" }}
            >
              What are you
              <br />
              <span className="glow-green" style={{ color: "var(--neon-green)" }}>
                studying?
              </span>
            </ReactiveHeading>
            <p
              className="mx-auto mt-6 max-w-lg text-[16px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              Type it in and you will have your first question about twenty
              seconds later.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <MagneticButton
                href="/signup"
                className="btn btn-lg box-glow-green"
                ariaLabel="Start studying free"
              >
                <span
                  className="font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--neon-green)" }}
                >
                  Start studying free
                </span>
              </MagneticButton>
              <Link
                href="/pricing"
                className="btn btn-lg"
                style={{
                  border: "1px solid rgb(255 255 255 / 0.16)",
                  color: "var(--text-1)",
                }}
              >
                See pricing
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
