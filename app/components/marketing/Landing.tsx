"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/app/components/brand/Logo";
import { Reveal, RevealWords } from "@/app/components/marketing/Reveal";

// The landing page.
//
// The old one was four text sections and a rule between each. It said the
// right things and looked like a README. This keeps every word that was
// earning its place and gives them somewhere to live: an aurora hero with a
// live product card, a scroll-driven walkthrough of the actual loop, and a
// mastery visual that shows the one thing no competitor does.
//
// Motion rules, applied throughout:
//   - transform and opacity only, so nothing triggers layout
//   - everything reveals once, never on every scroll-by
//   - the global prefers-reduced-motion rule leaves every final state on
//     screen, so the page is complete and readable with motion off

const SUBJECTS = [
  "AP World History",
  "Organic Chemistry",
  "Algebra II",
  "SAT Math",
  "AP Biology",
  "Spanish III",
  "US Government",
  "Physics C",
  "MCAT Bio",
  "AP Psychology",
  "Calculus BC",
  "Anatomy",
];

const STEPS = [
  {
    kicker: "01",
    title: "Give it anything",
    body: "A topic, your notes, a PDF, or a photo of the page. It reads all of it and finds the concepts worth knowing.",
  },
  {
    kicker: "02",
    title: "It builds everything",
    body: "Notes, questions and flashcards written from your material, in about twenty seconds.",
  },
  {
    kicker: "03",
    title: "It finds the gap",
    body: "Every answer updates a real model of what you know — not a percentage. It knows the difference between learned and lucky.",
  },
  {
    kicker: "04",
    title: "It closes the gap",
    body: "Miss something and it explains the exact misconception, then asks a different question on the same idea until it sticks.",
  },
];

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
    a: "Every answer feeds a mastery model that weighs how recently you answered, how hard the question was, how long you took, and whether you have forgotten it since. Topics you miss come back sooner; topics you have genuinely proven come back much later.",
  },
  {
    q: "Is it actually different from Quizlet?",
    a: "Quizlet holds your flashcards. AceDecks decides what you practise next, and tells you why. You never build a study plan or pick a mode — there is one obvious thing to do when you open it.",
  },
];

/* ------------------------------------------------------------ spotlight */

function useSpotlight() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      node.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };

    // Pointer events rather than mouse: this also tracks a stylus, and is
    // simply ignored on touch where there is no hover to light up.
    node.addEventListener("pointermove", onMove);
    return () => node.removeEventListener("pointermove", onMove);
  }, []);

  return ref;
}

/* --------------------------------------------------- hero product card */

// A compressed, honest version of a real session: the question, a wrong
// answer, and the recovery that follows. It is the product's actual
// behaviour, not an invented screenshot -- section 69's rule about not
// faking functionality applies to marketing as much as to the app.
const DEMO_STAGES = [
  { label: "Reading your notes", progress: 22 },
  { label: "Mapping concepts", progress: 54 },
  { label: "Writing questions", progress: 82 },
  { label: "Ready", progress: 100 },
];

function HeroCard() {
  const [stage, setStage] = useState(0);
  const spotlight = useSpotlight();

  useEffect(() => {
    if (stage >= DEMO_STAGES.length - 1) return;
    const timer = setTimeout(() => setStage((s) => s + 1), stage === 0 ? 900 : 1100);
    return () => clearTimeout(timer);
  }, [stage]);

  const current = DEMO_STAGES[stage];
  const isReady = stage >= DEMO_STAGES.length - 1;

  return (
    <div
      ref={spotlight}
      className="glass spotlight float relative w-full max-w-[420px] p-5 sm:p-6"
      style={{ boxShadow: "0 40px 90px -40px rgb(0 0 0 / 0.85)" }}
    >
      <div className="flex items-center gap-2.5">
        <LogoMark className="h-7 w-7" idPrefix="hero" />
        <span className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
          Chemistry — Periodic Trends
        </span>
      </div>

      {/* Generation progress, then the result */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
            {current.label}
          </span>
          <span
            className="text-[12px] tabular-nums"
            style={{ color: "var(--text-3)" }}
          >
            {current.progress}%
          </span>
        </div>
        <div className="meter mt-2" style={{ height: 5 }}>
          <span
            style={{
              width: `${current.progress}%`,
              background: "var(--brand-gradient)",
              transition: "width 900ms var(--ease-premium-out)",
            }}
          />
        </div>
      </div>

      <div
        className="mt-5 rounded-[var(--radius-md)] border p-4"
        style={{
          borderColor: "var(--line)",
          background: "rgb(0 0 0 / 0.25)",
          opacity: isReady ? 1 : 0.35,
          transition: "opacity 600ms var(--ease-premium-out)",
        }}
      >
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-1)" }}>
          Which trend increases left to right across a period?
        </p>

        <div className="mt-3 flex flex-col gap-1.5">
          <div
            className="rounded-lg border px-3 py-2 text-[13px]"
            style={{
              borderColor: "rgb(255 107 107 / 0.4)",
              background: "var(--bad-soft)",
              color: "var(--text-2)",
            }}
          >
            Atomic radius
          </div>
          <div
            className="rounded-lg border px-3 py-2 text-[13px]"
            style={{
              borderColor: "rgb(47 211 184 / 0.45)",
              background: "var(--ok-soft)",
              color: "var(--text-1)",
            }}
          >
            Electronegativity
          </div>
        </div>

        <div
          className="mt-3 rounded-lg px-3 py-2.5"
          style={{ background: "var(--brand-soft)" }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--brand-text)" }}
          >
            What went wrong
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            You reached for radius because it is the trend that gets taught
            first. Both change across a period — they just move opposite ways.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="chip chip-ok">Recovered</span>
        <span className="t-meta">Mastery 62% → 74%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- mastery */

const MASTERY_ROWS = [
  { topic: "Functions", value: 94, tone: "var(--accent-teal)" },
  { topic: "Quadratics", value: 81, tone: "var(--accent-teal)" },
  { topic: "Exponentials", value: 73, tone: "var(--brand)" },
  { topic: "Radicals", value: 51, tone: "var(--accent-amber)" },
  { topic: "Complex numbers", value: 38, tone: "var(--bad)" },
];

function MasteryPanel() {
  const spotlight = useSpotlight();

  return (
    <div ref={spotlight} className="glass spotlight edge-glow p-5 sm:p-7">
      <p className="t-section">Algebra II</p>
      <ul className="mt-5 flex flex-col gap-4">
        {MASTERY_ROWS.map((row, index) => (
          <Reveal as="li" key={row.topic} delay={index * 90}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[14.5px]" style={{ color: "var(--text-1)" }}>
                {row.topic}
              </span>
              <span
                className="text-[13px] tabular-nums"
                style={{ color: "var(--text-3)" }}
              >
                {row.value}%
              </span>
            </div>
            <div className="meter mt-2" style={{ height: 5 }}>
              <span style={{ width: `${row.value}%`, background: row.tone }} />
            </div>
          </Reveal>
        ))}
      </ul>
      <p className="t-meta mt-6">
        Radicals is the pick — not because it is lowest, but because it is
        worth the most marks you are currently dropping.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export function Landing() {
  return (
    <div className="relative overflow-x-clip" style={{ background: "var(--app-bg)" }}>
      {/* ============================ HERO ============================ */}
      <header className="relative grain overflow-hidden">
        <div className="aurora" aria-hidden="true">
          <i />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                style={{
                  borderColor: "var(--brand-line)",
                  background: "var(--brand-soft)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent-teal-bright)" }}
                  aria-hidden="true"
                />
                <span
                  className="text-[12.5px] font-medium"
                  style={{ color: "var(--brand-text)" }}
                >
                  Free, unlimited, no card
                </span>
              </div>

              <h1
                className="display mt-6 text-[clamp(2.6rem,7vw,4.6rem)]"
                style={{ color: "var(--text-1)" }}
              >
                <RevealWords text="Stop deciding" />
                <br />
                <RevealWords text="what to study." delay={220} />
                <br />
                {/* This line animates as one element rather than per word.
                    `background-clip: text` is painted by the element that
                    owns the background, and a transform on a *descendant*
                    promotes it to its own paint layer -- so per-word
                    animation here made the gradient text invisible. */}
                <span
                  className="text-gradient inline-block"
                  style={{
                    animation: "line-rise 0.9s var(--ease-premium-out) both",
                    animationDelay: "520ms",
                  }}
                >
                  Just study.
                </span>
              </h1>

              <Reveal delay={820}>
                <p
                  className="mt-7 max-w-[34rem] text-[17px] leading-relaxed sm:text-[19px]"
                  style={{ color: "var(--text-2)" }}
                >
                  Give AceDecks a topic or your notes. It writes the material,
                  quizzes you, works out exactly what you keep forgetting — and
                  brings it back until you know it.
                </p>
              </Reveal>

              <Reveal delay={940}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/signup" className="btn btn-gradient btn-lg">
                    Start studying free
                  </Link>
                  <Link href="/login" className="btn btn-secondary btn-lg">
                    I have an account
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={1040}>
                <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
                  {[
                    ["~20s", "notes to first question"],
                    ["Every miss", "explained, then retested"],
                    ["Unlimited", "on every feature"],
                  ].map(([value, label]) => (
                    <div key={label}>
                      <dt
                        className="text-[20px] font-semibold tracking-tight"
                        style={{ color: "var(--text-1)" }}
                      >
                        {value}
                      </dt>
                      <dd className="t-meta mt-0.5">{label}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            <Reveal delay={600} className="flex justify-center lg:justify-end">
              <HeroCard />
            </Reveal>
          </div>
        </div>

        {/* Subject marquee */}
        <div className="relative z-10 border-y py-4" style={{ borderColor: "var(--line)" }}>
          <div className="marquee">
            {[0, 1].map((copy) => (
              <div className="marquee-track" key={copy} aria-hidden={copy === 1}>
                {SUBJECTS.map((subject) => (
                  <span
                    key={`${copy}-${subject}`}
                    className="whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px]"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--text-3)",
                      background: "var(--panel)",
                    }}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ========================= THE LOOP ========================== */}
      <section
        aria-labelledby="how"
        className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <Reveal>
          <p className="t-section">How it works</p>
          <h2
            id="how"
            className="display mt-4 max-w-3xl text-[clamp(2rem,4.6vw,3.2rem)]"
            style={{ color: "var(--text-1)" }}
          >
            Four steps, and you never pick any of them.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-lg)] sm:grid-cols-2"
          style={{ background: "var(--line)" }}
        >
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 110} className="h-full">
              {/* The 1px grid gap plus a --line background on the parent is
                  what draws the hairlines between cells, so each cell paints
                  its own opaque panel over the top. */}
              <div
                style={{ background: "var(--panel)" }}
                className="spotlight h-full p-7 sm:p-9"
              >
                <span
                  className="text-[12px] font-semibold tabular-nums tracking-[0.14em]"
                  style={{ color: "var(--accent-teal)" }}
                >
                  {step.kicker}
                </span>
                <h3
                  className="mt-3 text-[21px] font-medium tracking-[-0.02em]"
                  style={{ color: "var(--text-1)" }}
                >
                  {step.title}
                </h3>
                <p className="t-body mt-2.5 max-w-md">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ========================== MASTERY =========================== */}
      <section
        aria-labelledby="mastery"
        className="relative overflow-hidden border-y"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2">
          <div>
            <Reveal>
              <p className="t-section">The difference</p>
              <h2
                id="mastery"
                className="display mt-4 text-[clamp(2rem,4.4vw,3rem)]"
                style={{ color: "var(--text-1)" }}
              >
                Most apps hold your flashcards.
                <br />
                <span className="text-gradient">This one knows what you forgot.</span>
              </h2>
            </Reveal>

            <Reveal delay={120}>
              <p className="t-body mt-6 max-w-xl text-[16px]">
                A percentage cannot tell a topic you nailed this morning from
                the same score five weeks ago. AceDecks models it properly —
                how recently you answered, how hard the question was, how long
                you hesitated, and how much of it has decayed since.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <ul className="mt-8 flex flex-col gap-3.5">
                {[
                  "Knows the difference between learned and lucky",
                  "Watches for the moment a topic starts slipping",
                  "Names the sub-skill you keep missing, not just the topic",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <svg
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-[18px] w-[18px] flex-none"
                      fill="none"
                      stroke="var(--accent-teal-bright)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m4 10.5 4 4 8-9" />
                    </svg>
                    <span className="text-[15.5px]" style={{ color: "var(--text-2)" }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={160}>
            <MasteryPanel />
          </Reveal>
        </div>
      </section>

      {/* ============================ FAQ ============================= */}
      <section
        aria-labelledby="faq"
        className="mx-auto w-full max-w-3xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <Reveal>
          <p className="t-section">Questions</p>
          <h2
            id="faq"
            className="display mt-4 text-[clamp(1.9rem,4vw,2.6rem)]"
            style={{ color: "var(--text-1)" }}
          >
            The short answers.
          </h2>
        </Reveal>

        <div className="mt-10">
          {FAQ_ITEMS.map((item, index) => (
            <Reveal key={item.q} delay={index * 70}>
              <details
                className="group border-b py-5"
                style={{ borderColor: "var(--line)" }}
              >
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16.5px] font-medium transition-colors hover:text-[var(--brand-text)]"
                  style={{ color: "var(--text-1)" }}
                >
                  {item.q}
                  <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-full border transition-transform duration-300 group-open:rotate-45"
                    style={{ borderColor: "var(--line-strong)" }}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M7 1.5v11M1.5 7h11" />
                    </svg>
                  </span>
                </summary>
                <p className="t-body mt-4 max-w-2xl text-[15.5px]">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* =========================== CLOSE ============================ */}
      <section
        aria-label="Get started"
        className="relative grain overflow-hidden border-t"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="aurora" aria-hidden="true">
          <i />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-3xl px-5 py-28 text-center sm:px-8 sm:py-36">
          <Reveal>
            <LogoMark className="mx-auto h-14 w-14" idPrefix="close" />
            <h2
              className="display mt-8 text-[clamp(2.1rem,5vw,3.4rem)]"
              style={{ color: "var(--text-1)" }}
            >
              What are you studying?
            </h2>
            <p className="t-body mx-auto mt-5 max-w-lg text-[17px]">
              Type it in, and you will have your first question about twenty
              seconds later.
            </p>
            <Link href="/signup" className="btn btn-gradient btn-lg mt-9">
              Start studying free
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
