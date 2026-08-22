import type { Metadata } from "next";
import Link from "next/link";
import { PageViewTracker } from "./components/PageViewTracker";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acediq.com";

export const metadata: Metadata = {
  title: "AcedIQ | The AI study app that decides what you study next",
  description:
    "Give AcedIQ a topic, your notes, or a photo. It writes the study material, quizzes you, works out what you keep forgetting, and brings it back until you know it.",
  alternates: { canonical: "/" },
  keywords: [
    "AI Study App",
    "Quizlet Alternative",
    "Knowt Alternative",
    "AI Flashcards",
    "SAT Study App",
    "AP Study App",
    "Spaced Repetition",
  ],
  openGraph: {
    title: "AcedIQ | The AI study app that decides what you study next",
    description:
      "Give it a topic or your notes. It writes the material, quizzes you, and brings back what you forget.",
    url: "/",
    siteName: "AcedIQ",
    type: "website",
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: "AcedIQ" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AcedIQ | The AI study app that decides what you study next",
    description:
      "Give it a topic or your notes. It writes the material, quizzes you, and brings back what you forget.",
    images: ["/twitter-image"],
  },
};

// Three steps, because there are three steps. The old homepage had eight
// sections, an autoplaying demo rail, an embedded playable battle, a product
// story, a stat band, and a nine-item FAQ -- all before a visitor could work
// out what the product does.
const STEPS = [
  {
    title: "Give it anything",
    body: "Type a topic, paste your notes, or attach a PDF or a photo of the page.",
  },
  {
    title: "It builds everything",
    body: "Notes, questions, and flashcards, written from your material in about twenty seconds.",
  },
  {
    title: "It keeps you honest",
    body: "It tracks what you keep getting wrong and brings it back until you know it.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What does it cost?",
    a: `Nothing. ${FREE_PLAN_LIMIT_SUMMARY}`,
  },
  {
    q: "Do I need to have notes?",
    a: "No. Type what you are studying — a topic like “photosynthesis” or “AP World Unit 3” — and AcedIQ writes the study material for you.",
  },
  {
    q: "What can I upload?",
    a: "PDFs, photos of a textbook or your handwriting, and plain text files. You can also import a Quizlet set, an Anki deck, or a Google Doc.",
  },
  {
    q: "How does it know what I am bad at?",
    a: "Every question you answer updates a per-topic score. Topics you miss come back sooner; topics you have proven you know come back much later.",
  },
];

export default function Home() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
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
      "AI study app that turns any material into notes, questions, and flashcards, then adapts to what the student keeps getting wrong.",
    provider: { "@id": `${siteUrl}/#organization` },
    featureList: [
      "Turn a topic, PDF, or photo into study material",
      "AI-written notes, questions, and flashcards",
      "Spaced repetition",
      "Per-topic mastery tracking",
      "AI tutor that knows your material",
    ],
    isAccessibleForFree: true,
    inLanguage: "en",
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/pricing`,
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to study with AcedIQ",
    description: "Turn any material into an adaptive study session.",
    totalTime: "PT15M",
    step: STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
  };

  return (
    <div style={{ background: "var(--app-bg)", color: "var(--text-1)" }}>
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <PageViewTracker page="home" funnelEvent="homepage_viewed" />

      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        {/* ---------- Hero ---------- */}
        <header className="py-20 sm:py-28">
          <h1
            className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[52px]"
            style={{ color: "var(--text-1)" }}
          >
            Stop deciding what to study.
          </h1>
          <p
            className="mt-5 max-w-xl text-[17px] leading-relaxed sm:text-[19px]"
            style={{ color: "var(--text-2)" }}
          >
            Give AcedIQ a topic or your notes. It writes the study material,
            quizzes you, and works out what you keep forgetting — then brings
            it back until you know it.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start studying — it is free
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              I already have an account
            </Link>
          </div>

          <p className="t-meta mt-4">{FREE_PLAN_LIMIT_SUMMARY}</p>
        </header>

        <hr className="rule" />

        {/* ---------- How it works ---------- */}
        <section aria-labelledby="how" className="py-16 sm:py-20">
          <h2 id="how" className="t-section">
            How it works
          </h2>
          <ol className="mt-6 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span
                  className="text-[13px] font-medium tabular-nums"
                  style={{ color: "var(--brand-text)" }}
                >
                  {index + 1}
                </span>
                <h3
                  className="mt-2 text-[17px] font-medium"
                  style={{ color: "var(--text-1)" }}
                >
                  {step.title}
                </h3>
                <p className="t-body mt-1.5">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <hr className="rule" />

        {/* ---------- What makes it different ---------- */}
        <section aria-labelledby="difference" className="py-16 sm:py-20">
          <h2
            id="difference"
            className="max-w-xl text-2xl font-semibold tracking-[-0.02em] sm:text-3xl"
            style={{ color: "var(--text-1)" }}
          >
            Most study apps hold your flashcards. This one decides what you
            practise next.
          </h2>
          <p className="t-body mt-4 max-w-xl">
            Every answer you give updates a score for that specific topic. When
            you open AcedIQ, there is one thing on the screen worth doing, and
            it is the thing that will actually move your grade. No dashboard to
            read, no schedule to build, no settings to pick.
          </p>
        </section>

        <hr className="rule" />

        {/* ---------- FAQ ---------- */}
        <section aria-labelledby="faq" className="py-16 sm:py-20">
          <h2 id="faq" className="t-section">
            Questions
          </h2>
          <div className="mt-5">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="group border-b py-4"
                style={{ borderColor: "var(--line)" }}
              >
                <summary
                  className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium"
                  style={{ color: "var(--text-1)" }}
                >
                  {item.q}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    className="h-4 w-4 flex-none transition-transform duration-200 group-open:rotate-180"
                    style={{ color: "var(--text-4)" }}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="t-body mt-3 max-w-2xl">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Close ---------- */}
        <section aria-label="Get started" className="py-16 text-center sm:py-20">
          <h2
            className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl"
            style={{ color: "var(--text-1)" }}
          >
            What are you studying?
          </h2>
          <Link href="/signup" className="btn btn-primary btn-lg mt-6">
            Start studying — it is free
          </Link>
        </section>

        {/* ---------- Footer ---------- */}
        <footer
          className="flex flex-wrap items-center justify-between gap-4 border-t py-8"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="t-meta">AcedIQ</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
            {[
              { href: "/pricing", label: "Pricing" },
              { href: "/contact", label: "Contact" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px]"
                style={{ color: "var(--text-3)" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
