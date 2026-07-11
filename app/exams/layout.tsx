import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exam Prep Study Tunnels",
  description:
    "Practice MCAT, LSAT, NCLEX, and AP exam-style battles with AI-guided remediation and timed pressure drills.",
  alternates: {
    canonical: "/exams",
  },
  keywords: [
    "SAT study app",
    "MCAT study app",
    "LSAT study app",
    "NCLEX study platform",
    "AP exam practice app",
  ],
  openGraph: {
    title: "Exam Prep Study Tunnels | StudyClash",
    description:
      "High-stakes exam prep through battle-style practice and weak-topic loops.",
    url: "/exams",
    images: ["/opengraph-image"],
  },
};

export default function ExamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
