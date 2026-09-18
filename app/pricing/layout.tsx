import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AceDecks Pricing | AI Study App and Quizlet Alternative",
  description:
    "AceDecks is free to start. Ace Pro removes the monthly limit on study sets and adds full mistake breakdowns, for $9.99 a month or $99 a year.",
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
      "Free to start. Ace Pro is $9.99 a month or $99 a year.",
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
