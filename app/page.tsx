import type { Metadata } from "next";
import Link from "next/link";
import VyraCoach from "./components/LazyVyraCoach";
import InstantAIBattle from "./components/InstantAIBattle";
import AutoplayDemoRail from "./components/AutoplayDemoRail";
import { PageViewTracker } from "./components/PageViewTracker";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { PLAN_METADATA } from "@/lib/plans";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";
import { StaggerContainer, StaggerItem } from "./components/motion/Stagger";
import { FloatingCard } from "./components/motion/FloatingCard";
import { ProductStory } from "./components/ProductStory";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acediq.com";

export const metadata: Metadata = {
  title: "AI Study App | AcedIQ Battle-Based Quizlet Alternative",
  description:
    "AcedIQ is an AI study app and Quizlet alternative where students turn notes into instant study battles, flashcard battle loops, and adaptive AI practice for SAT and AP prep.",
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
    title: "AcedIQ | AI Study App, Flashcard Battle, Quizlet Alternative",
    description:
      "Upload notes, auto-generate questions, battle an AI, and improve with weak-topic recovery loops.",
    url: "/",
    siteName: "AcedIQ",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AcedIQ AI study battle preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AcedIQ | AI Study App and Competitive Learning",
    description:
      "Study faster with AI study battles, adaptive opponents, and weak-topic remediation.",
    images: ["/twitter-image"],
  },
};

const STEPS = [
  {
    title: "Upload your material",
    body: "Add notes, a PDF, or a study topic.",
  },
  {
    title: "Battle to practice",
    body: "Compete against AI or challenge a friend.",
  },
  {
    title: "Rematch your weaknesses",
    body: "Study the topics you missed until you master them.",
  },
];

const BENEFITS = [
  "AI-generated questions from your material",
  "Instant AI and friend battles",
  "Weak-topic detection",
  "Targeted rematches",
  "Clear explanations",
  "Progress tracking",
];

// Factual, verifiable differentiators only -- no subjective "we're better"
// claims and no comparison table naming competitors by strength/weakness.
const DIFFERENTIATORS = [
  "Live AI battles",
  "Timed scoring",
  "Weak-topic detection",
  "Targeted rematches",
  "Friend challenge links",
  "Questions generated from your own material",
];

const FAQ_ITEMS = [
  {
    q: "What is AcedIQ?",
    a: "AcedIQ is an AI study platform where your notes become live quiz battles with instant feedback and weak-topic diagnostics.",
  },
  {
    q: "How is this different from Quizlet or Knowt?",
    a: "AcedIQ is battle-first, with realistic AI opponents, live duel scoring, and targeted rematch loops instead of passive flashcard scrolling.",
  },
  {
    q: "Can I battle instantly without creating a room?",
    a: "Yes. Tap Try an Instant Battle and start instantly in Easy, Medium, Hard, or Adaptive mode. No lobby required.",
  },
  {
    q: "Is there a free plan?",
    a: `Yes. ${FREE_PLAN_LIMIT_SUMMARY} ${PLAN_METADATA.pro_individual.label} also unlocks the full VYRA coach.`,
  },
];

export default function Home() {
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
    name: "AcedIQ",
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
      category: PLAN_METADATA.free_beta.label,
      availability: "https://schema.org/InStock",
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "AcedIQ",
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
    name: "AcedIQ Homepage",
    url: siteUrl,
    isPartOf: {
      "@id": `${siteUrl}/#website`,
    },
    about: {
      "@id": `${siteUrl}/#software`,
    },
    description:
      "Homepage for AcedIQ, an AI study app focused on battle-style learning and weak-topic recovery.",
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to study with AcedIQ",
    description: "Turn notes into battle-based study sessions and improve weak topics quickly.",
    totalTime: "PT18M",
    step: STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
  };

  return (
    <div className="relative min-h-dvh bg-[#0B0F19] text-[#F2F4FA]">
      <div className="mesh-bg" aria-hidden="true">
        <div className="mesh-bloom mesh-bloom-violet" />
        <div className="mesh-bloom mesh-bloom-indigo" />
        <div className="mesh-grid-overlay" />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <PageViewTracker page="home" funnelEvent="homepage_viewed" />
      <div className={`mx-auto flex w-full max-w-[1200px] flex-col px-5 sm:px-8 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {/* ---------- 1. Hero ---------- */}
        <header className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <StaggerContainer staggerDelay={0.09}>
            <StaggerItem>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-brand-primary-emphasis">
                Competitive studying, powered by AI
              </p>
            </StaggerItem>

            <StaggerItem>
              <h1 className="mt-5 max-w-[620px] bg-gradient-to-b from-white to-[#C9CEE8] bg-clip-text text-4xl font-bold leading-[1.1] tracking-tight text-transparent sm:text-5xl">
                Roast Your Friends. Ace Your Tests.
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-4 max-w-[560px] text-base leading-relaxed text-[#8B93B0] sm:text-lg">
                Upload anything, challenge your friends, and let AcedIQ expose exactly what each of you needs to study.
              </p>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/diagnostics"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-brand-primary px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary-emphasis"
                >
                  Take a free diagnostic
                </Link>
                <Link
                  href="/demo/battle"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] glow-border px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10"
                >
                  See how it works
                </Link>
              </div>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-3 text-xs font-medium text-[#8B93B0]">
                Try the demo without signing up. Create an account when you want to upload and save your own material.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <FloatingCard className="rounded-lg border border-white/10 bg-[#0B1220] p-2 shadow-elevation-md" floatDistance={5} tiltStrength={4}>
            <AutoplayDemoRail />
          </FloatingCard>
        </header>

        {/* ---------- 2. Interactive product preview ---------- */}
        <section aria-label="Try a live round" className="border-t border-white/10 py-14 sm:py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">See AcedIQ in action</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[#8B93B0]">
              Quick Battle: pick a difficulty and answer 5 questions against the AI. No signup required.
            </p>
          </div>

          <div className="mt-8 rounded-[14px] border border-white/10 bg-[#0B1220] p-4 shadow-sm sm:p-6">
            <InstantAIBattle />
          </div>

          <p className="mt-4 text-center text-sm text-[#8B93B0]">
            Want the full picture? Try the{" "}
            <Link href="/demo/battle" className="font-semibold text-[#A855F7] hover:underline">
              Guided Product Demo
            </Link>{" "}
            for the complete loop: upload, battle, mistakes, and a weak-topic rematch.
          </p>
        </section>

        {/* ---------- 3. Product story ---------- */}
        <section aria-label="From notes to mastery" className="border-t border-white/10 py-14 sm:py-16">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">From notes to mastery</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[#8B93B0]">
            The same loop every battle runs on, step by step.
          </p>
          <div className="mt-8">
            <ProductStory />
          </div>
        </section>

        {/* ---------- 4. Core benefits ---------- */}
        <section aria-label="Core benefits" className="border-t border-white/10 py-14 sm:py-16">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.03] glow-border p-4">
                <svg className="h-5 w-5 flex-shrink-0 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-sm font-medium text-white">{benefit}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- What makes AcedIQ different ---------- */}
        <section aria-label="What makes AcedIQ different" className="border-t border-white/10 py-14 sm:py-16">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">What makes AcedIQ different</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((item) => (
              <div key={item} className="rounded-[14px] border border-white/10 bg-white/[0.03] glow-border p-4">
                <span className="text-sm font-medium text-white">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- 6. Simple pricing preview ---------- */}
        <section id="pricing" aria-label="Pricing preview" className="border-t border-white/10 py-14 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Start free, scale when you need more</h2>
            <Link href="/pricing" className="text-sm font-semibold text-[#A855F7] hover:text-[#9333EA]">
              View all plans
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] glow-border p-6">
              <h3 className="text-base font-semibold text-white">{PLAN_METADATA.free_beta.label}</h3>
              <p className="mt-1 text-3xl font-bold text-white">{PLAN_METADATA.free_beta.price}</p>
              <p className="mt-2 text-sm text-[#8B93B0]">{PLAN_METADATA.free_beta.tagline}</p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] glow-border text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10"
              >
                Start Free
              </Link>
            </div>

            <div className="relative rounded-[14px] border-2 border-[#A855F7] bg-white/[0.04] p-6">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#A855F7] px-3 py-1 text-[11px] font-semibold text-white">
                Most Popular
              </span>
              <h3 className="text-base font-semibold text-white">{PLAN_METADATA.pro_individual.label}</h3>
              <p className="mt-1 text-3xl font-bold text-white">{PLAN_METADATA.pro_individual.price}</p>
              <p className="mt-2 text-sm text-[#8B93B0]">{PLAN_METADATA.pro_individual.tagline}</p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#A855F7] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#9333EA]"
              >
                Go Pro
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- 7. FAQ ---------- */}
        <section id="faq" aria-label="Frequently asked questions" className="border-t border-white/10 py-14 sm:py-16">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">FAQ</h2>
          <div className="mt-5 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group rounded-[14px] border border-white/10 bg-white/[0.03] glow-border p-4 transition-colors duration-150 open:border-[#A855F7]/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-white sm:text-base">
                  {item.q}
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-[#A855F7] transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <p className="mt-2 text-sm text-[#8B93B0]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final call to action ---------- */}
        <section aria-label="Get started" className="border-t border-white/10 py-14 sm:py-16">
          <div className="rounded-[14px] border border-white/10 bg-[#131A2C] p-8 text-center sm:p-10">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to make studying competitive?</h2>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="#battle-ai"
                className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[#A855F7] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#9333EA]"
              >
                Try an Instant Battle
              </Link>
              <Link
                href="/create"
                className="inline-flex h-12 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] glow-border px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10"
              >
                Create Your First Deck
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- 8. Footer ---------- */}
        <footer className="border-t border-white/10 py-8 text-sm text-[#8B93B0]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>AcedIQ · Competitive studying for the AI era</p>
            <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer links">
              <Link href="/create" className="hover:text-white">Create</Link>
              <Link href="/demo/battle" className="hover:text-white">Guided Demo</Link>
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
              <Link href="/exams" className="hover:text-white">Exams</Link>
              <Link href="/classroom" className="hover:text-white">Classroom (Beta)</Link>
              <Link href="/contact" className="hover:text-white">Contact</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>

      <VyraCoach contextLabel="Website" />
    </div>
  );
}
