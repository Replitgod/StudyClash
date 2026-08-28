import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AceDecks Pricing | AI Study App and Quizlet Alternative",
  description:
    "Compare AceDecks pricing for high-school students, including a free plan and paid tiers for AI study battles and exam prep.",
  alternates: {
    canonical: "/pricing",
  },
  keywords: [
    "study app pricing",
    "AI learning platform pricing",
    "quizlet alternative pricing",
    "knowt alternative pricing",
    "student study app subscription",
  ],
  openGraph: {
    title: "AceDecks Pricing | Free And Pro Plans",
    description:
      "Compare the Free plan and AceDecks Pro pricing options.",
    url: "/pricing",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AceDecks Pricing | AI Study App Plans",
    description:
      "See Free and paid plans for AI study battles, adaptive practice, and exam prep.",
    images: ["/twitter-image"],
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
