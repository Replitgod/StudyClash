import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exam Prep Study App | SAT, AP, MCAT, LSAT, NCLEX",
  description:
    "Practice SAT-style, AP, MCAT, LSAT, and NCLEX battle drills with AI-guided remediation, timed pressure practice, and weak-topic recovery.",
  alternates: {
    canonical: "/exams",
  },
  keywords: [
    "SAT study app",
    "MCAT study app",
    "LSAT study app",
    "NCLEX study platform",
    "AP exam practice app",
    "AP study app",
  ],
  openGraph: {
    title: "Exam Prep Study Tunnels | StudyClash",
    description:
      "High-stakes exam prep through battle-style practice and weak-topic loops.",
    url: "/exams",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyClash Exams | SAT/AP/MCAT/LSAT/NCLEX Battle Prep",
    description:
      "Train with exam-style AI battles and targeted remediation loops.",
    images: ["/twitter-image"],
  },
};

export default function ExamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
