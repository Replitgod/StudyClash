import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Demo Battle",
  description:
    "Try StudyClash instantly with a free AI demo battle and see weak-topic insights in one flow.",
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
};

export default function DemoBattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
