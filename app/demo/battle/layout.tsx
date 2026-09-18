import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guided Product Demo | AceDecks",
  description:
    "Try the full AceDecks loop with a guided product demo: battle, review mistakes, and see a weak-topic rematch -- no signup required.",
  alternates: {
    canonical: "/demo/battle",
  },
  keywords: [
    "free study game demo",
    "AI quiz battle demo",
    "study clash demo",
  ],
  openGraph: {
    title: "Guided Product Demo | AceDecks",
    description:
      "Start the no-signup guided demo and experience the full AceDecks loop instantly.",
    url: "/demo/battle",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Guided Product Demo | AceDecks",
    description:
      "Try AceDecks without an account: answer a few questions and see how it handles a mistake.",
    images: ["/twitter-image"],
  },
};

export default function DemoBattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
