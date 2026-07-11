import type { Metadata } from "next";
import Link from "next/link";
import GigglesCoach from "./components/GigglesCoach";
import InstantAIBattle from "./components/InstantAIBattle";
import AutoplayDemoRail from "./components/AutoplayDemoRail";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyclash.com";

export const metadata: Metadata = {
  title: "StudyClash | Battle an AI and Turn Notes Into Winning Study Sessions",
  description:
    "StudyClash is an AI study app and Quizlet alternative where your notes become live battles. Upload notes, battle an AI instantly, and get weak-topic reports with one-click rematch.",
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
  ],
  openGraph: {
    title: "StudyClash | Battle an AI Instantly",
    description:
      "Upload notes, auto-generate questions, battle an AI, and get weak-topic recovery plans in seconds.",
    url: siteUrl,
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
    title: "StudyClash | AI Study Battles",
    description:
      "Study faster with instant AI battles, live scoring, and weak-topic reports.",
    images: ["/twitter-image"],
  },
};

const DEMO_STEPS = [
  "Upload notes",
  "AI generates questions",
  "Battle an AI",
  "Live battle",
  "Winning",
  "Weak-topic report",
  "One-click rematch",
];

const TRUST_ITEMS = [
  "Built for real student workflows",
  "Transparent free beta limits",
  "Actionable weak-topic diagnostics",
  "Fast support via feedback button",
];

const FEATURE_CARDS = [
  {
    title: "Instant AI Opponent",
    body: "No room setup. Pick Easy, Medium, or Hard and start in one click.",
  },
  {
    title: "Your Notes, Not Generic Content",
    body: "PDF upload or pasted notes become a question set tailored to your source.",
  },
  {
    title: "Pressure That Keeps You Focused",
    body: "Timed battles keep sessions active and fun instead of passive scrolling.",
  },
  {
    title: "Weak-Topic Report",
    body: "See exactly where you missed and what to fix before your next attempt.",
  },
  {
    title: "One-Click Rematch",
    body: "Run another battle immediately and lock in mastery while it is fresh.",
  },
  {
    title: "Built-In VYRA Coach",
    body: "Ask follow-up questions and get next-best study actions from your results.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I used to waste time building flashcards. Now I drop notes, battle, and know exactly what to review.",
    name: "Aanya P.",
    role: "SAT student",
  },
  {
    quote:
      "The weak-topic report is the difference. It tells me why I missed, not just my score.",
    name: "Rohan M.",
    role: "Engineering undergrad",
  },
  {
    quote:
      "Battle an AI made revision competitive and actually fun for my classroom prep group.",
    name: "Nia T.",
    role: "High school mentor",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is StudyClash?",
    a: "StudyClash is an AI learning platform where your notes become live quiz battles with instant feedback and weak-topic analysis.",
  },
  {
    q: "How is this different from Quizlet or Knowt?",
    a: "StudyClash focuses on live competitive studying, realistic opponent behavior, and guided rematch loops instead of static review cards.",
  },
  {
    q: "Can I battle instantly without creating a room?",
    a: "Yes. The Battle an AI mode starts immediately from the homepage with Easy, Medium, and Hard options.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Free Beta is available, and pilot pricing includes low nominal paid tiers for advanced usage.",
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
    name: "StudyClash",
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
    name: "StudyClash",
    url: siteUrl,
    description:
      "AI learning platform for study battles, weak-topic insights, and rematch-based mastery.",
    inLanguage: "en",
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to study with StudyClash",
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
    <main className="relative min-h-screen overflow-x-hidden bg-[#04070f] text-white">
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="absolute -left-48 top-[24%] h-[500px] w-[500px] rounded-full bg-fuchsia-500/15 blur-[120px]" />
        <div className="absolute -right-40 bottom-[-120px] h-[560px] w-[560px] rounded-full bg-emerald-400/15 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <header className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
              AI Study Battles
            </p>

            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Turn notes into
              <span className="block bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300 bg-clip-text text-transparent">
                fast, fun, competitive mastery.
              </span>
            </h1>

            <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
              StudyClash is an AI study app and Quizlet alternative that lets you upload notes,
              battle an AI instantly, and get a weak-topic report with one-click rematch.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#battle-ai"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-9 py-4 text-lg font-black text-[#052538] shadow-[0_20px_50px_-30px_rgba(34,211,238,0.9)] transition-transform duration-200 hover:scale-[1.02] active:scale-95"
              >
                Battle an AI
              </a>
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-base font-bold text-white/90 transition-colors duration-150 hover:border-cyan-200/40 hover:bg-white/10"
              >
                Upload Notes
              </Link>
              <Link
                href="/demo/battle"
                className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-8 py-4 text-base font-bold text-emerald-100 transition-colors duration-150 hover:border-emerald-200/40 hover:bg-emerald-500/20"
              >
                Try Demo
              </Link>
            </div>

            <ul className="mt-7 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
              {TRUST_ITEMS.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <AutoplayDemoRail />
        </header>

        <section className="mt-14 rounded-3xl border border-white/15 bg-white/[0.03] p-5 sm:p-7">
          <h2 className="text-lg font-black text-white">Everything in one flow</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {DEMO_STEPS.map((step) => (
              <div key={step} className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-center text-xs font-semibold text-white/85">
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <InstantAIBattle />
        </section>

        <section id="features" className="mt-16">
          <div className="text-center">
            <h2 className="text-3xl font-black sm:text-4xl">Why students switch to StudyClash</h2>
            <p className="mx-auto mt-3 max-w-2xl text-white/65">
              Built for competitive studying and fast feedback loops, not static memorization.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-white/10 bg-[#071426]/70 p-5 transition-colors duration-200 hover:border-cyan-300/35"
              >
                <h3 className="text-lg font-black text-cyan-100">{card.title}</h3>
                <p className="mt-2 text-sm text-white/70">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-5 lg:grid-cols-3" aria-label="Social proof">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
            <p className="text-3xl font-black text-cyan-200">12k+</p>
            <p className="mt-1 text-sm text-white/65">Pilot battles completed</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
            <p className="text-3xl font-black text-emerald-200">8.7/10</p>
            <p className="mt-1 text-sm text-white/65">Average session fun rating</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
            <p className="text-3xl font-black text-fuchsia-200">74%</p>
            <p className="mt-1 text-sm text-white/65">Users rematch in same session</p>
          </article>
        </section>

        <section className="mt-16" aria-label="Testimonials">
          <h2 className="text-2xl font-black sm:text-3xl">Loved by competitive learners</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <blockquote key={item.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-sm text-white/80">\"{item.quote}\"</p>
                <footer className="mt-3 text-xs font-semibold text-cyan-100">
                  {item.name} · {item.role}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-black sm:text-3xl">Pilot pricing for public beta</h2>
            <Link href="/pricing" className="text-sm font-bold text-cyan-200 hover:text-cyan-100">
              View all plans
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-5">
              <h3 className="text-lg font-black text-emerald-100">Free Beta</h3>
              <p className="mt-1 text-3xl font-black text-white">$0</p>
              <p className="mt-2 text-sm text-emerald-100/90">Ideal for first-time users and daily practice.</p>
            </article>
            <article className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-5">
              <h3 className="text-lg font-black text-cyan-100">Pro Individual</h3>
              <p className="mt-1 text-3xl font-black text-white">$3/mo pilot</p>
              <p className="mt-2 text-sm text-cyan-100/90">Low nominal pricing for active testers and heavy usage.</p>
            </article>
            <article className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/10 p-5">
              <h3 className="text-lg font-black text-fuchsia-100">Exam Tunnel</h3>
              <p className="mt-1 text-3xl font-black text-white">$5/mo pilot</p>
              <p className="mt-2 text-sm text-fuchsia-100/90">Higher-intensity prep for SAT-style battle training.</p>
            </article>
          </div>
        </section>

        <section className="mt-16" id="faq" aria-label="Frequently asked questions">
          <h2 className="text-2xl font-black sm:text-3xl">FAQ</h2>
          <div className="mt-4 space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 open:border-cyan-300/35">
                <summary className="cursor-pointer list-none text-sm font-bold text-white sm:text-base">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm text-white/70">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="answer-engine-facts">
          <h2 id="answer-engine-facts" className="text-2xl font-black sm:text-3xl">
            Quick Facts For Search And AI Answers
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-bold text-cyan-100">What StudyClash is</h3>
              <p className="mt-1 text-sm text-white/70">
                StudyClash is an AI study app that converts notes into competitive quiz battles with instant feedback.
              </p>
            </article>
            <article className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-bold text-cyan-100">Who it is for</h3>
              <p className="mt-1 text-sm text-white/70">
                Built for high school and college students, tutors, teachers, and exam-prep learners.
              </p>
            </article>
            <article className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-bold text-cyan-100">Why it is different</h3>
              <p className="mt-1 text-sm text-white/70">
                It combines timed AI battles, weak-topic diagnosis, and one-click rematch loops instead of passive flashcard review.
              </p>
            </article>
            <article className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-bold text-cyan-100">Where to start</h3>
              <p className="mt-1 text-sm text-white/70">
                Start with <Link href="/demo/battle" className="text-cyan-200 hover:text-cyan-100">Demo Battle</Link> or go to <Link href="/create" className="text-cyan-200 hover:text-cyan-100">Create Deck</Link> to upload notes.
              </p>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/create", label: "AI Study App" },
              { href: "/demo/battle", label: "Study Battle" },
              { href: "/pricing", label: "Quizlet Alternative" },
              { href: "/exams", label: "SAT Study App" },
              { href: "/mastery-map", label: "AI Learning Platform" },
              { href: "/clashrank", label: "Competitive Studying" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-white/15 pt-6 text-sm text-white/65">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>StudyClash · Competitive Studying for the AI era</p>
            <nav className="flex flex-wrap gap-4" aria-label="Footer links">
              <Link href="/create" className="hover:text-white">Create</Link>
              <Link href="/demo/battle" className="hover:text-white">Demo</Link>
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
              <Link href="/exams" className="hover:text-white">SAT Study App</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>

      <GigglesCoach contextLabel="Website" />
    </main>
  );
}
