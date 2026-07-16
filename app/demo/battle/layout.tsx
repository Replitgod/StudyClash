import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free AI Study Battle Demo",
  description:
    "Try StudyClash instantly with a free AI study battle demo and see weak-topic insights in one flow.",
  alternates: {
    canonical: "/demo/battle",
  },
  keywords: [
    "free study game demo",
    "AI quiz battle demo",
    "study clash demo",
  ],
  openGraph: {
    title: "Free Demo Battle | StudyClash",
    description:
      "Start a no-signup demo battle and experience AI study workflows instantly.",
    url: "/demo/battle",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Study Battle Demo | StudyClash",
    description:
      "No-signup demo for AI-powered study battles and instant feedback.",
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
