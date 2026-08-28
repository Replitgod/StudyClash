"use client";

import Link from "next/link";
import { KineticHero } from "@/app/components/marketing/KineticHero";
import { TelemetrySteps } from "@/app/components/marketing/TelemetrySteps";
import { GapRadar } from "@/app/components/marketing/GapRadar";
import { Flashcard3D } from "@/app/components/marketing/Flashcard3D";
import { NeonCursor } from "@/app/components/marketing/NeonCursor";
import { Reveal } from "@/app/components/marketing/Reveal";
import { MagneticButton } from "@/app/components/motion/MagneticButton";
import { LogoMark } from "@/app/components/brand/Logo";

// The public landing experience.
//
// Ordered so the page argues rather than just lists: the hero resolves into
// a knowledge map, the loop explains how the map gets built, the radar
// shows what it catches, and the flashcard lets you feel the moment it
// catches something.

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
      className="grain-heavy relative overflow-x-clip"
      style={{ background: "var(--void)", color: "var(--text-1)" }}
    >
      <NeonCursor />

      {/* ============================ HERO ============================ */}
      <KineticHero />

      {/* ============================ LOOP ============================ */}
      <TelemetrySteps />

      {/* ======================== GAP LOCATOR ========================= */}
      <section
        aria-labelledby="gaps"
        className="relative border-y py-24 sm:py-32"
        style={{
          borderColor: "rgb(255 255 255 / 0.07)",
          background: "var(--void-raised)",
        }}
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <Reveal>
            <GapRadar />
          </Reveal>
        </div>
      </section>

      {/* ========================== FLASHCARD ========================= */}
      <section
        aria-labelledby="card"
        className="relative py-24 sm:py-32"
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: "var(--neon-green)" }}
            >
              Live card
            </p>
            <h2
              id="card"
              className="brutal mt-4 text-[clamp(2.2rem,5.6vw,4.4rem)]"
              style={{ color: "var(--text-1)", ["--wdth" as string]: 94 }}
            >
              Get it wrong.<br />
              <span className="neon-blue glow-blue">On purpose.</span>
            </h2>
            <p
              className="mt-6 max-w-md text-[16px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              This is the real card, wired to the real behaviour. Pick the
              wrong answer and you get exactly what the app gives you: the
              specific misconception, not “Incorrect. Answer: B.”
            </p>
            <p className="mt-5 text-[13px]" style={{ color: "var(--text-3)" }}>
              Go on — pick the wrong one.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <Flashcard3D />
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
            <h2
              id="faq"
              className="brutal text-[clamp(2rem,5vw,3.6rem)]"
              style={{ color: "var(--text-1)", ["--wdth" as string]: 94 }}
            >
              Short answers.
            </h2>
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
                      style={{ borderColor: "rgb(180 255 57 / 0.4)" }}
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
        <div className="tech-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div
          className="absolute left-1/2 top-1/2 h-[60vw] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          aria-hidden="true"
          style={{
            background: "radial-gradient(circle, rgb(180 255 57 / 0.12), transparent 62%)",
            filter: "blur(70px)",
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 sm:px-8">
          <Reveal>
            <LogoMark className="mx-auto h-14 w-14" idPrefix="neon-close" />
            <h2
              className="brutal mt-8 text-[clamp(2.4rem,7vw,5rem)]"
              style={{ color: "var(--text-1)", ["--wdth" as string]: 96 }}
            >
              What are you<br />
              <span className="neon-green glow-green">studying?</span>
            </h2>
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
                  className="font-semibold uppercase tracking-[0.08em]"
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
