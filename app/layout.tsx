import FeedbackButton from "./components/FeedbackButton";
import Navigation from "./components/Navigation";
import { AuthProvider } from "@/lib/useAuth";
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyclash.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04070f",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StudyClash | AI Study Battles",
    template: "%s | StudyClash",
  },
  description:
    "StudyClash is an AI study app where you upload notes, battle an AI, and improve with weak-topic reports and one-click rematches.",
  applicationName: "StudyClash",
  category: "education",
  referrer: "origin-when-cross-origin",
  creator: "StudyClash",
  publisher: "StudyClash",
  authors: [{ name: "StudyClash" }],
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
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: "StudyClash | AI Study Battles",
    description:
      "Turn your notes into live AI study battles with weak-topic diagnostics and one-click rematch loops.",
    siteName: "StudyClash",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "StudyClash AI study battles preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyClash | AI Study Battles",
    description:
      "Upload notes, battle an AI instantly, and improve with weak-topic reports.",
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
  name: "StudyClash",
  url: siteUrl,
  logo: `${siteUrl}/opengraph-image`,
  description:
    "StudyClash is an AI study platform for interactive quiz battles, weak-topic analysis, and personalized study improvement.",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@studyclash.app",
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
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-[#0b1f2a] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-cyan-100"
          >
            Skip to main content
          </a>
          <Navigation />
          <main id="main-content" className="flex-1">{children}</main>
          <FeedbackButton />
        </AuthProvider>
      </body>
    </html>
  );
}