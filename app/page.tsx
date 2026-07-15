import type { Metadata } from "next";
import Link from "next/link";
import VyraCoach from "./components/VyraCoach";
import InstantAIBattle from "./components/InstantAIBattle";
import AutoplayDemoRail from "./components/AutoplayDemoRail";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Button } from "./components/ui/Button";
import { Badge } from "./components/ui/Badge";
import { Reveal } from "./components/ui/Reveal";
import { HoverLiftArticle } from "./components/ui/HoverLift";
import { HeroReveal, HeroRevealItem } from "./components/HeroReveal";
import { HeroCtaSound } from "./components/HeroCtaSound";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export const metadata: Metadata = {
  title: "AI Study App | StudyJoust Battle-Based Quizlet Alternative",
  description:
    "StudyJoust is an AI study app and Quizlet alternative where students turn notes into instant study battles, flashcard battle loops, and adaptive AI practice for SAT and AP prep.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "AI Study App",
    "Quizlet Alternative",
    "Knowt Alternative",
    "Study Battle",
    "Competitive Studying",
    "SAT Study App",
    "Study Game",
    "Flashcard Battle",
    "AI Learning Platform",
    "Competitive Learning",
    "AI Flashcards",
    "AP Study App",
  ],
  openGraph: {
    title: "StudyJoust | AI Study App, Flashcard Battle, Quizlet Alternative",
    description:
      "Upload notes, auto-generate questions, battle an AI, and improve with weak-topic recovery loops.",
    url: "/",
    siteName: "StudyJoust",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "StudyJoust AI study battle preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyJoust | AI Study App and Competitive Learning",
    description:
      "Study faster with AI study battles, adaptive opponents, and weak-topic remediation.",
    images: ["/twitter-image"],
  },
};

const DEMO_STEPS = [
  "Upload notes",
  "AI generates questions",
  "Battle an AI",
  "Battle interface",
  "Victory",
  "Weak-topic report",
  "One-click rematch",
];

const HERO_TRUST = [
  "No multiplayer lobby",
  "No setup confusion",
  "One-click instant match",
  "Adaptive AI realism",
];

const DIFFERENTIATORS = [
  {
    title: "Active Recall Under Pressure",
    body: "Real pressure. Real retrieval.",
  },
  {
    title: "Your Notes Become the Arena",
    body: "Upload notes, get a battle deck.",
  },
  {
    title: "Adaptive AI Opponent",
    body: "It learns your pace and pushes back.",
  },
  {
    title: "Weak Topic Intelligence",
    body: "See exactly what you're missing.",
  },
  {
    title: "One-click Rematch Loops",
    body: "Lose? Rematch instantly.",
  },
  {
    title: "Coach Layer Built In",
    body: "VYRA breaks down every miss.",
  },
];

type UsageMetric = {
  label: string;
  value: string;
};

const TRUST_FALLBACK_ITEMS = [
  "Early Beta",
  "Built for Students",
  "AI-Powered Study Battles",
  "Personalized Weak-Topic Reports",
  "Multiplayer + Battle an AI",
  "Secure Authentication",
  "Continuous Updates",
];

function readVerifiedUsageMetrics(): UsageMetric[] {
  const raw = process.env.PUBLIC_USAGE_METRICS_JSON?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;

        const candidate = entry as Record<string, unknown>;
        const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
        const value = typeof candidate.value === "string" ? candidate.value.trim() : "";

        if (!label || !value) return null;

        return {
          label: label.slice(0, 120),
          value: value.slice(0, 60),
        };
      })
      .filter((entry): entry is UsageMetric => entry !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}

const COMPARISON_ROWS = [
  {
    label: "Instant AI battle from homepage",
    studyjoust: "Yes",
    quizlet: "No",
    knowt: "No",
  },
  {
    label: "Adaptive opponent behavior",
    studyjoust: "Yes",
    quizlet: "No",
    knowt: "No",
  },
  {
    label: "Weak-topic rematch loops",
    studyjoust: "Yes",
    quizlet: "Limited",
    knowt: "Limited",
  },
  {
    label: "Real-time duel scoring",
    studyjoust: "Yes",
    quizlet: "No",
    knowt: "No",
  },
  {
    label: "Battle-first motivation",
    studyjoust: "High",
    quizlet: "Low",
    knowt: "Low",
  },
];

const FEEDBACK_THEMES = [
  {
    title: "Fast to start",
    summary:
      "New users can run a full demo quickly and understand the product before committing to account setup.",
  },
  {
    title: "More active than passive review",
    summary:
      "Battle pressure and immediate weak-topic feedback make study sessions feel focused and less repetitive.",
  },
  {
    title: "Clear next step",
    summary:
      "One-click rematches reduce drop-off because users always know what to do after each battle.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is StudyJoust?",
    a: "StudyJoust is an AI study platform where your notes become live quiz battles with instant feedback and weak-topic diagnostics.",
  },
  {
    q: "How is this different from Quizlet or Knowt?",
    a: "StudyJoust is battle-first, with realistic AI opponents, live duel scoring, and targeted rematch loops instead of passive flashcard scrolling.",
  },
  {
    q: "Can I battle instantly without creating a room?",
    a: "Yes. Tap Battle an AI on the homepage and start instantly in Easy, Medium, Hard, or Adaptive mode. No lobby required.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Battle loops are free forever. Pro Premium unlocks unlimited play and the full VYRA coach.",
  },
];

// Turns the comparison table's plain "Yes"/"No"/"Limited"/"High"/"Low"
// strings into a check/cross so the StudyJoust-vs-competitor scan reads at
// a glance instead of requiring the reader to parse text in every cell.
function ComparisonValue({ value }: { value: string }) {
  if (value === "Yes" || value === "High") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {value}
      </span>
    );
  }

  if (value === "No" || value === "Low") {
    return (
      <span className="inline-flex items-center gap-1 text-white/35">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        {value}
      </span>
    );
  }

  return <span className="text-white/55">{value}</span>;
}

export default function Home() {
  const verifiedUsageMetrics = readVerifiedUsageMetrics();
  const hasVerifiedUsageMetrics = verifiedUsageMetrics.length > 0;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#software`,
    name: "StudyJoust",
    mainEntityOfPage: `${siteUrl}/`,
    url: siteUrl,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Study Platform",
    operatingSystem: "Web",
    browserRequirements: "Modern web browser",
    description:
      "AI study app for competitive studying with instant AI battles, weak-topic reports, and one-click rematches.",
    provider: {
      "@id": `${siteUrl}/#organization`,
    },
    featureList: [
      "Upload notes or PDF",
      "Generate AI quiz questions",
      "Battle an AI instantly",
      "Adaptive difficulty (easy, medium, hard, adaptive)",
      "Track weak topics and mastery",
      "One-click rematch",
      "AI study coach",
    ],
    isAccessibleForFree: true,
    inLanguage: "en",
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/pricing`,
      price: "0",
      priceCurrency: "USD",
      category: "Free Beta",
      availability: "https://schema.org/InStock",
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "StudyJoust",
    url: siteUrl,
    description:
      "AI learning platform for study battles, weak-topic insights, and rematch-based mastery.",
    inLanguage: "en",
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${siteUrl}/#home`,
    name: "StudyJoust Homepage",
    url: siteUrl,
    isPartOf: {
      "@id": `${siteUrl}/#website`,
    },
    about: {
      "@id": `${siteUrl}/#software`,
    },
    description:
      "Homepage for StudyJoust, an AI study app focused on battle-style learning and weak-topic recovery.",
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to study with StudyJoust",
    description:
      "Turn notes into battle-based study sessions and improve weak topics quickly.",
    totalTime: "PT18M",
    step: DEMO_STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step,
      text: step,
    })),
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#04070f] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="absolute -left-48 top-[24%] h-[500px] w-[500px] rounded-full bg-fuchsia-500/15 blur-[120px]" />
        <div className="absolute -right-40 bottom-[-120px] h-[560px] w-[560px] rounded-full bg-emerald-400/15 blur-[130px]" />
      </div>

      <div className={`relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4 pt-10 sm:px-6 sm:pt-14 ${FLOATING_ACTION.mobileBottomPadding}`}>
        <header className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <HeroReveal>
            <HeroRevealItem>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                Early Access AI Study Platform
              </p>
            </HeroRevealItem>

            <HeroRevealItem className="mt-5">
              <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
                Stop Guessing What to Study.{" "}
                <span className="block bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300 bg-clip-text text-transparent">
                  Start Mastering It.
                </span>
              </h1>
            </HeroRevealItem>

            <HeroRevealItem className="mt-4">
              <p className="max-w-2xl text-base text-white/75 sm:text-lg">
                One click. Zero setup. Beat the AI.
              </p>
            </HeroRevealItem>

            {/* One high-contrast primary action, one low-contrast secondary --
                the old third button (a separate "no signup demo" path) is
                gone: the primary CTA below already jumps to the same
                no-signup instant battle, so a third option was a competing
                path to the identical outcome, not a distinct one. */}
            <HeroRevealItem className="mt-7 flex flex-col gap-3 sm:flex-row">
              <HeroCtaSound href="#battle-ai" variant="battle" size="lg" className="text-lg">
                Start Instant Battle (No Signup)
              </HeroCtaSound>
              <Button href="/create" variant="ghost" size="lg">
                Upload Notes (PDF/Text)
              </Button>
            </HeroRevealItem>

            <HeroRevealItem className="mt-5">
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-white/60">
                {HERO_TRUST.map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </HeroRevealItem>
          </HeroReveal>

          <AutoplayDemoRail />
        </header>

        {/* One zone instead of three: the old "Start in the way that matches
            you" cards and "What you see in 18 seconds" step strip both just
            re-described what the hero's AutoplayDemoRail already shows --
            this replaces both with the actual playable widget, plus the two
            alternate paths (guided demo, upload notes) as plain links
            instead of their own full card sections. */}
        <section aria-label="Play a test round">
          <Reveal className="mt-12">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white sm:text-3xl">Now try it yourself</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-white/60">
                Same widget as above -- pick a difficulty and answer 5 questions against the AI.
              </p>
            </div>

            <div className="mt-6">
              <InstantAIBattle />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/demo/battle" className="font-semibold text-cyan-200/85 transition-colors duration-150 hover:text-cyan-100">
                Prefer a guided 90-second walkthrough? Try the demo &rarr;
              </Link>
              <Link href="/create" className="font-semibold text-cyan-200/85 transition-colors duration-150 hover:text-cyan-100">
                Or upload your own notes &rarr;
              </Link>
            </div>
          </Reveal>
        </section>

        <section id="features">
          <Reveal className="mt-16">
            <div className="text-center">
              <h2 className="text-3xl font-black sm:text-4xl">Built to feel like a game, not homework</h2>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DIFFERENTIATORS.map((card) => (
                <HoverLiftArticle
                  key={card.title}
                  className="rounded-2xl border border-white/10 bg-[#071426]/70 p-5 hover:border-cyan-300/35"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-500/10 text-cyan-200">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="mt-3 text-lg font-black text-cyan-100">{card.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{card.body}</p>
                </HoverLiftArticle>
              ))}
            </div>
          </Reveal>
        </section>

        <section aria-label="Comparison table">
          <Reveal className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-black sm:text-3xl">Fast comparison</h2>
              <p className="text-sm text-white/60">Battle-first study vs passive flashcard workflows</p>
            </div>

            {/* Table layout: md and up. Mobile gets stacked cards below instead
                of a horizontally-scrolling table, so there's no overflow. */}
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-white/10 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-white/[0.04] text-white/80">
                  <tr>
                    <th className="px-4 py-3 font-bold">Capability</th>
                    <th className="px-4 py-3 font-bold text-cyan-200">StudyJoust</th>
                    <th className="px-4 py-3 font-bold">Quizlet</th>
                    <th className="px-4 py-3 font-bold">Knowt</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.label} className="border-t border-white/10">
                      <td className="px-4 py-3 text-white/80">{row.label}</td>
                      <td className="bg-cyan-500/[0.05] px-4 py-3 font-semibold">
                        <ComparisonValue value={row.studyjoust} />
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonValue value={row.quizlet} />
                      </td>
                      <td className="px-4 py-3">
                        <ComparisonValue value={row.knowt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Carousel: below md. Native CSS scroll-snap, so swiping works
                with no JS -- one capability per card, snapped to center. */}
            <div className="mt-5 md:hidden">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/40">
                Swipe to compare
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </p>
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                {COMPARISON_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="w-[78%] flex-shrink-0 snap-center rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <p className="text-sm font-bold text-white/85">{row.label}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2 py-2">
                        <p className="font-bold uppercase tracking-wide text-cyan-200/80">StudyJoust</p>
                        <p className="mt-1 flex justify-center">
                          <ComparisonValue value={row.studyjoust} />
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                        <p className="font-bold uppercase tracking-wide text-white/50">Quizlet</p>
                        <p className="mt-1 flex justify-center">
                          <ComparisonValue value={row.quizlet} />
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                        <p className="font-bold uppercase tracking-wide text-white/50">Knowt</p>
                        <p className="mt-1 flex justify-center">
                          <ComparisonValue value={row.knowt} />
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        <section aria-label="Trust and transparency">
          <Reveal className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-black sm:text-3xl">Trust through transparency</h2>
              <p className="text-sm text-white/60">
                {hasVerifiedUsageMetrics
                  ? "Verified analytics from production telemetry"
                  : "No vanity numbers in early beta"}
              </p>
            </div>

            {hasVerifiedUsageMetrics ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {verifiedUsageMetrics.map((metric) => (
                  <article key={metric.label} className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-5">
                    <p className="text-3xl font-black text-cyan-100">{metric.value}</p>
                    <p className="mt-1 text-sm text-cyan-100/90">{metric.label}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TRUST_FALLBACK_ITEMS.map((item) => (
                  <article key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-white/85">{item}</p>
                  </article>
                ))}
              </div>
            )}

            {!hasVerifiedUsageMetrics && (
              <p className="mt-4 text-sm text-white/65">
                StudyJoust is in active early access. We are onboarding students and educators in small waves, collecting feedback, and improving weekly before wider release.
              </p>
            )}
          </Reveal>
        </section>

        <section aria-label="Early beta feedback themes">
          <Reveal className="mt-16">
            <h2 className="text-2xl font-black sm:text-3xl">What early beta users value most</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {FEEDBACK_THEMES.map((item) => (
                <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-100">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/80">{item.summary}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="pricing">
          <Reveal className="mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-black sm:text-3xl">Start free, scale when you need more</h2>
              <Link href="/pricing" className="text-sm font-bold text-cyan-200 hover:text-cyan-100">
                View all plans
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3 md:items-end">
              <HoverLiftArticle className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-5">
                <h3 className="text-lg font-black text-emerald-100">Free</h3>
                <p className="mt-1 text-3xl font-black text-white">$0</p>
                <p className="mt-2 text-sm text-emerald-100/90">Battle loops, free forever.</p>
                <Button href="/pricing" variant="success" size="sm" fullWidth className="mt-4">
                  Start Free
                </Button>
              </HoverLiftArticle>

              <HoverLiftArticle className="relative rounded-2xl border border-cyan-300/40 bg-cyan-500/[0.12] p-5 shadow-glow-cyan-sm md:-translate-y-2 md:p-6">
                <Badge tone="cyan" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
                <h3 className="text-lg font-black text-cyan-100">Pro Premium</h3>
                <p className="mt-1 text-3xl font-black text-white">$5/mo</p>
                <p className="mt-2 text-sm text-cyan-100/90">Unlimited battles + full VYRA coach.</p>
                <Button href="/pricing" variant="battle" size="sm" fullWidth className="mt-4">
                  Go Premium
                </Button>
              </HoverLiftArticle>

              <HoverLiftArticle className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/10 p-5">
                <h3 className="text-lg font-black text-fuchsia-100">Exam Tunnel</h3>
                <p className="mt-1 text-3xl font-black text-white">$9/mo</p>
                <p className="mt-2 text-sm text-fuchsia-100/90">Board-style prep for AP, LSAT, MCAT, NCLEX.</p>
                <Button href="/pricing" variant="primary" size="sm" fullWidth className="mt-4">
                  View Exam Tunnel
                </Button>
              </HoverLiftArticle>
            </div>
          </Reveal>
        </section>

        <section id="faq" aria-label="Frequently asked questions">
          <Reveal className="mt-16">
            <h2 className="text-2xl font-black sm:text-3xl">FAQ</h2>
            <div className="mt-4 space-y-3">
              {FAQ_ITEMS.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors duration-fast open:border-cyan-300/35">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white sm:text-base">
                    {item.q}
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-cyan-200 transition-transform duration-base ease-brand-bounce group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </summary>
                  <p className="mt-2 text-sm text-white/70">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        <section aria-label="Final call to action">
          <Reveal className="mt-16 rounded-3xl border border-cyan-300/25 bg-cyan-500/10 p-6 text-center sm:p-8">
            <h2 className="text-2xl font-black sm:text-4xl">Ready to study like a competition?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-cyan-100/90 sm:text-base">
              Click Battle an AI and start instantly. Or upload your notes and generate a personalized battle deck in under a minute.
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="#battle-ai" variant="inverse" size="lg">
                Start Instant Battle
              </Button>
              <Button href="/create" variant="ghost" size="lg">
                Upload Notes and Play
              </Button>
            </div>
          </Reveal>
        </section>

        <footer className="mt-16 border-t border-white/15 pt-6 text-sm text-white/65">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>StudyJoust · Competitive studying for the AI era</p>
            <nav className="flex flex-wrap gap-4" aria-label="Footer links">
              <Link href="/create" className="hover:text-white">Create</Link>
              <Link href="/demo/battle" className="hover:text-white">Demo</Link>
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
              <Link href="/diagnostics" className="hover:text-white">SAT Diagnostic</Link>
              <Link href="/exams" className="hover:text-white">Premium Tunnel Options</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
            </nav>
          </div>

          <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/45" aria-labelledby="answer-engine-facts">
            <summary id="answer-engine-facts" className="cursor-pointer select-none font-semibold text-white/50">
              About StudyJoust
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p>StudyJoust is an AI study app that converts notes into competitive quiz battles with instant feedback.</p>
              <p>Built for high school and college students, tutors, teachers, and exam-prep learners.</p>
              <p>Combines timed AI battles, weak-topic diagnosis, and one-click rematch loops instead of passive flashcard review.</p>
              <p>
                Start with <Link href="/demo/battle" className="text-cyan-200/70 hover:text-cyan-100">Demo Battle</Link> or <Link href="/create" className="text-cyan-200/70 hover:text-cyan-100">Create Deck</Link>.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { href: "/create", label: "AI Study App" },
                { href: "/demo/battle", label: "Study Battle" },
                { href: "/pricing", label: "Quizlet Alternative" },
                { href: "/exams", label: "Premium Tunnel Options" },
                { href: "/mastery-map", label: "AI Learning Platform" },
                { href: "/clashrank", label: "Competitive Studying" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50 hover:text-white/80"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </footer>
      </div>

      <VyraCoach contextLabel="Website" />
    </div>
  );
}
