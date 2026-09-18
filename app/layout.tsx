import FeedbackButton from "./components/LazyFeedbackButton";
import HashAnchorScroller from "./components/HashAnchorScroller";
import { MarketingAttributionCapture } from "./components/MarketingAttributionCapture";
import AppFrame from "./components/app/AppFrame";
import { PageTransition } from "./components/PageTransition";
import { AuthProvider } from "@/lib/useAuth";
import { UI_Z_INDEX } from "@/lib/uiLayout";
import { CONTACT_EMAIL } from "@/lib/contact";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import { MotionConfig } from "motion/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The display face. Archivo is loaded with its width axis as well as
// weight, which is what lets headlines actually *warp* on scroll --
// interpolating `font-variation-settings: "wdth"` re-shapes the letterforms
// rather than just stretching a bitmap, which is the difference between a
// variable-font effect and a `transform: scaleX` that smears the strokes.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050506",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AceDecks | Study it once, remember it for the test",
    template: "%s | AceDecks",
  },
  description:
    "Turn a topic, your notes, a PDF or a photo into practice questions and flashcards. AceDecks checks every answer, finds what you keep getting wrong, and brings it back before you forget it.",
  applicationName: "AceDecks",
  category: "education",
  referrer: "origin-when-cross-origin",
  creator: "AceDecks",
  publisher: "AceDecks",
  authors: [{ name: "AceDecks" }],
  keywords: [
    "study app",
    "flashcards",
    "spaced repetition",
    "active recall",
    "practice questions",
    "Quizlet alternative",
    "Anki alternative",
    "Digital SAT practice",
    "AP exam practice",
    "MCAT practice",
    "study from notes",
  ],
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  openGraph: {
    type: "website",
    title: "AceDecks | Study it once, remember it for the test",
    description:
      "Practice questions and flashcards from your own material, with every answer checked, and review timed to what you're forgetting.",
    siteName: "AceDecks",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AceDecks",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AceDecks | Study it once, remember it for the test",
    description:
      "Practice questions and flashcards from your own material, and review timed to what you're forgetting.",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: "AceDecks",
  url: siteUrl,
  logo: `${siteUrl}/opengraph-image`,
  description:
    "AceDecks turns study material into checked practice questions and flashcards, and schedules review around what each student is forgetting.",
  sameAs: [
    `${siteUrl}/`,
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      areaServed: "Worldwide",
      availableLanguage: ["English"],
      url: `${siteUrl}/contact`,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        {/* reducedMotion="user" makes every motion.* component in the tree
            respect prefers-reduced-motion automatically (framer-motion
            animates transform/opacity via JS, so the CSS media-query rule
            in globals.css can't reach it on its own). */}
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <HashAnchorScroller />
            <MarketingAttributionCapture />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-[var(--panel-raised)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--text-1)]"
              style={{ zIndex: UI_Z_INDEX.skipLink }}
            >
              Skip to main content
            </a>
            <AppFrame>
              <PageTransition>{children}</PageTransition>
            </AppFrame>
            {/* Renders nothing until "Send feedback" is opened from Settings. */}
            <FeedbackButton />
          </AuthProvider>
        </MotionConfig>
      </body>
    </html>
  );
}