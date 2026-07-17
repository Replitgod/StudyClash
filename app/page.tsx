import type { Metadata } from "next";
import Link from "next/link";
import VyraCoach from "./components/VyraCoach";
import InstantAIBattle from "./components/InstantAIBattle";
import AutoplayDemoRail from "./components/AutoplayDemoRail";
import { PageViewTracker } from "./components/PageViewTracker";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { PLAN_METADATA } from "@/lib/plans";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";
import { HeroReveal, HeroRevealItem } from "./components/HeroReveal";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export const metadata: Metadata = {
  title: "AI Study App | StudyClash Battle-Based Quizlet Alternative",
  description:
    "StudyClash is an AI study app and Quizlet alternative where students turn notes into instant study battles, flashcard battle loops, and adaptive AI practice for SAT and AP prep.",
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
    title: "StudyClash | AI Study App, Flashcard Battle, Quizlet Alternative",
    description:
      "Upload notes, auto-generate questions, battle an AI, and improve with weak-topic recovery loops.",
    url: "/",
    siteName: "StudyClash",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "StudyClash AI study battle preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyClash | AI Study App and Competitive Learning",
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
    q: "What is StudyClash?",
    a: "StudyClash is an AI study platform where your notes become live quiz battles with instant feedback and weak-topic diagnostics.",
  },
  {
    q: "How is this different from Quizlet or Knowt?",
    a: "StudyClash is battle-first, with realistic AI opponents, live duel scoring, and targeted rematch loops instead of passive flashcard scrolling.",
  },
  {
    q: "Can I battle instantly without creating a room?",
    a: "Yes. Tap Try Instant Battle and start instantly in Easy, Medium, Hard, or Adaptive mode. No lobby required.",
  },
  {
    q: "Is there a free plan?",
    a: `Yes. ${FREE_PLAN_LIMIT_SUMMARY} ${PLAN_METADATA.pro_individual.label} also unlocks the full VYRA coach.`,
  },
];

function StepIcon({ index }: { index: number }) {
  const paths = [
    <path key="upload" strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />,
    <path key="battle" strokeLinecap="round" strokeLinejoin="round" d="M13 3 L5 13h5l-1 8 8-10h-5z" />,
    <path key="fix" strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  ];
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {paths[index]}
    </svg>
  );
}

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
    name: "StudyClash",
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
    name: "StudyClash",
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
    name: "StudyClash Homepage",
    url: siteUrl,
    isPartOf: {
      "@id": `${siteUrl}/#website`,
    },
    about: {
      "@id": `${siteUrl}/#software`,
    },
    description:
      "Homepage for StudyClash, an AI study app focused on battle-style learning and weak-topic recovery.",
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to study with StudyClash",
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
    <div className="min-h-dvh bg-[#F8FAFC] text-[#0F172A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <PageViewTracker page="home" />
      <div className={`mx-auto flex w-full max-w-[1200px] flex-col px-5 sm:px-8 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {/* ---------- 1. Hero ---------- */}
        <header className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <HeroReveal>
            <HeroRevealItem>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#EEF2FF] px-3.5 py-1.5 text-xs font-semibold text-[#4F46E5]">
                Competitive studying, powered by AI
              </p>
            </HeroRevealItem>

            <HeroRevealItem className="mt-5">
              <h1 className="max-w-[620px] text-4xl font-bold leading-[1.1] tracking-tight text-[#0F172A] sm:text-5xl">
                Turn your notes into a study battle.
              </h1>
            </HeroRevealItem>

            <HeroRevealItem className="mt-4">
              <p className="max-w-[560px] text-base leading-relaxed text-[#64748B] sm:text-lg">
                Upload your material, compete against AI or friends, and rematch the topics you miss.
              </p>
            </HeroRevealItem>

            <HeroRevealItem className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="#battle-ai"
                className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[#4F46E5] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#4338CA]"
              >
                Try Instant Battle
              </Link>
              <Link
                href="/create"
                className="inline-flex h-12 items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white px-6 text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC]"
              >
                Upload Notes
              </Link>
            </HeroRevealItem>

            <HeroRevealItem className="mt-3">
              <p className="text-xs font-medium text-[#64748B]">
                Try the demo without signing up. Create an account when you want to upload and save your own material.
              </p>
            </HeroRevealItem>
          </HeroReveal>

          <div className="rounded-[14px] border border-[#E2E8F0] bg-[#0B1220] p-2 shadow-sm">
            <AutoplayDemoRail />
          </div>
        </header>

        {/* ---------- 2. Interactive product preview ---------- */}
        <section aria-label="Try a live round" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#0F172A] sm:text-3xl">See StudyClash in action</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[#64748B]">
              Pick a difficulty and answer 5 questions against the AI. No signup required.
            </p>
          </div>

          <div className="mt-8 rounded-[14px] border border-[#E2E8F0] bg-[#0B1220] p-4 shadow-sm sm:p-6">
            <InstantAIBattle />
          </div>
        </section>

        {/* ---------- 3. Three-step explanation ---------- */}
        <section aria-label="From notes to mastery" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <h2 className="text-center text-2xl font-bold text-[#0F172A] sm:text-3xl">From notes to mastery</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-[14px] border border-[#E2E8F0] bg-white p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#EEF2FF] text-[#4F46E5]">
                  <StepIcon index={index} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#0F172A]">{step.title}</h3>
                <p className="mt-1.5 text-sm text-[#64748B]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- 4. Core benefits ---------- */}
        <section aria-label="Core benefits" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                <svg className="h-5 w-5 flex-shrink-0 text-[#4F46E5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-sm font-medium text-[#0F172A]">{benefit}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- What makes StudyClash different ---------- */}
        <section aria-label="What makes StudyClash different" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <h2 className="text-2xl font-bold text-[#0F172A] sm:text-3xl">What makes StudyClash different</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DIFFERENTIATORS.map((item) => (
              <div key={item} className="rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <span className="text-sm font-medium text-[#0F172A]">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- 6. Simple pricing preview ---------- */}
        <section id="pricing" aria-label="Pricing preview" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-bold text-[#0F172A] sm:text-3xl">Start free, scale when you need more</h2>
            <Link href="/pricing" className="text-sm font-semibold text-[#4F46E5] hover:text-[#4338CA]">
              View all plans
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-6">
              <h3 className="text-base font-semibold text-[#0F172A]">{PLAN_METADATA.free_beta.label}</h3>
              <p className="mt-1 text-3xl font-bold text-[#0F172A]">{PLAN_METADATA.free_beta.price}</p>
              <p className="mt-2 text-sm text-[#64748B]">{PLAN_METADATA.free_beta.tagline}</p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC]"
              >
                Start Free
              </Link>
            </div>

            <div className="relative rounded-[14px] border-2 border-[#4F46E5] bg-white p-6">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#4F46E5] px-3 py-1 text-[11px] font-semibold text-white">
                Most Popular
              </span>
              <h3 className="text-base font-semibold text-[#0F172A]">{PLAN_METADATA.pro_individual.label}</h3>
              <p className="mt-1 text-3xl font-bold text-[#0F172A]">{PLAN_METADATA.pro_individual.price}</p>
              <p className="mt-2 text-sm text-[#64748B]">{PLAN_METADATA.pro_individual.tagline}</p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#4F46E5] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#4338CA]"
              >
                Go Pro
              </Link>
            </div>

            <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-6">
              <h3 className="text-base font-semibold text-[#0F172A]">{PLAN_METADATA.exam_tunnel.label}</h3>
              <p className="mt-1 text-3xl font-bold text-[#0F172A]">{PLAN_METADATA.exam_tunnel.price}</p>
              <p className="mt-2 text-sm text-[#64748B]">{PLAN_METADATA.exam_tunnel.tagline}</p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC]"
              >
                View {PLAN_METADATA.exam_tunnel.label}
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- 7. FAQ ---------- */}
        <section id="faq" aria-label="Frequently asked questions" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <h2 className="text-2xl font-bold text-[#0F172A] sm:text-3xl">FAQ</h2>
          <div className="mt-5 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group rounded-[14px] border border-[#E2E8F0] bg-white p-4 transition-colors duration-150 open:border-[#4F46E5]/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#0F172A] sm:text-base">
                  {item.q}
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-[#4F46E5] transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <p className="mt-2 text-sm text-[#64748B]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final call to action ---------- */}
        <section aria-label="Get started" className="border-t border-[#E2E8F0] py-14 sm:py-16">
          <div className="rounded-[14px] border border-[#E2E8F0] bg-[#EEF2FF] p-8 text-center sm:p-10">
            <h2 className="text-2xl font-bold text-[#0F172A] sm:text-3xl">Ready to make studying competitive?</h2>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="#battle-ai"
                className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[#4F46E5] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#4338CA]"
              >
                Try Instant Battle
              </Link>
              <Link
                href="/create"
                className="inline-flex h-12 items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white px-6 text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC]"
              >
                Create Your First Deck
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- 8. Footer ---------- */}
        <footer className="border-t border-[#E2E8F0] py-8 text-sm text-[#64748B]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>StudyClash · Competitive studying for the AI era</p>
            <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer links">
              <Link href="/create" className="hover:text-[#0F172A]">Create</Link>
              <Link href="/demo/battle" className="hover:text-[#0F172A]">Demo</Link>
              <Link href="/pricing" className="hover:text-[#0F172A]">Pricing</Link>
              <Link href="/exams" className="hover:text-[#0F172A]">Exams</Link>
              <Link href="/classroom" className="hover:text-[#0F172A]">Classroom (Beta)</Link>
              <Link href="/contact" className="hover:text-[#0F172A]">Contact</Link>
              <Link href="/privacy" className="hover:text-[#0F172A]">Privacy</Link>
              <Link href="/terms" className="hover:text-[#0F172A]">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>

      <VyraCoach contextLabel="Website" />
    </div>
  );
}
