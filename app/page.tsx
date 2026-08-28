import type { Metadata } from "next";
import { PageViewTracker } from "./components/PageViewTracker";
import { Landing } from "./components/marketing/Landing";
import { SiteFooter } from "./components/marketing/SiteFooter";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

export const metadata: Metadata = {
  title: "AceDecks | The AI study app that decides what you study next",
  description:
    "Give AceDecks a topic, your notes, or a photo. It writes the study material, quizzes you, works out what you keep forgetting, and brings it back until you know it.",
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
    title: "AceDecks | The AI study app that decides what you study next",
    description:
      "Give it a topic or your notes. It writes the material, quizzes you, and brings back what you forget.",
    url: "/",
    siteName: "AceDecks",
    type: "website",
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: "AceDecks" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AceDecks | The AI study app that decides what you study next",
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
    a: "Nothing. Every feature is free and unlimited — no daily caps, no locked modes, no card required.",
  },
  {
    q: "Do I need to have notes?",
    a: "No. Type what you are studying — a topic like “photosynthesis” or “AP World Unit 3” — and AceDecks writes the study material for you.",
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
    name: "AceDecks",
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
    name: "How to study with AceDecks",
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
    <>
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

      <Landing />
      <SiteFooter />
    </>
  );
}
