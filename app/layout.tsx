import FeedbackButton from "./components/FeedbackButton";
import FloatingBattleCTA from "./components/FloatingBattleCTA";
import HashAnchorScroller from "./components/HashAnchorScroller";
import MainContentShell from "./components/MainContentShell";
import Navigation from "./components/Navigation";
import { PageTransition } from "./components/PageTransition";
import { AuthProvider } from "@/lib/useAuth";
import { UI_Z_INDEX } from "@/lib/uiLayout";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04070f",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StudyJoust | AI Study App for Battle-Based Learning",
    template: "%s | StudyJoust",
  },
  description:
    "StudyJoust is an AI study app where students upload notes, battle an AI, and improve with weak-topic diagnostics, rematches, and exam-focused practice loops.",
  applicationName: "StudyJoust",
  category: "education",
  referrer: "origin-when-cross-origin",
  creator: "StudyJoust",
  publisher: "StudyJoust",
  authors: [{ name: "StudyJoust" }],
  keywords: [
    "AI Study App",
    "Quizlet Alternative",
    "Knowt Alternative",
    "Study Battle",
    "Flashcard Battle",
    "Competitive Learning",
    "Competitive Studying",
    "SAT Study App",
    "AP Study App",
    "AI Flashcards",
    "Study Game",
    "AI Learning Platform",
  ],
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  openGraph: {
    type: "website",
    title: "StudyJoust | AI Study App for Competitive Learning",
    description:
      "Turn notes into AI study battles with weak-topic diagnostics, flashcard battle loops, and exam-ready practice.",
    siteName: "StudyJoust",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "StudyJoust AI study battles preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyJoust | AI Study App and Quizlet Alternative",
    description:
      "Upload notes, battle an AI instantly, and improve with weak-topic diagnostics.",
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
  name: "StudyJoust",
  url: siteUrl,
  logo: `${siteUrl}/opengraph-image`,
  description:
    "StudyJoust is an AI study platform for interactive quiz battles, weak-topic analysis, and personalized study improvement.",
  sameAs: [
    `${siteUrl}/`,
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "siddharthdatla582@gmail.com",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <AuthProvider>
          <HashAnchorScroller />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-[#0b1f2a] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-cyan-100"
            style={{ zIndex: UI_Z_INDEX.skipLink }}
          >
            Skip to main content
          </a>
          <Navigation />
          <MainContentShell>
            <PageTransition>{children}</PageTransition>
          </MainContentShell>
          <FloatingBattleCTA />
          <FeedbackButton />
        </AuthProvider>
      </body>
    </html>
  );
}