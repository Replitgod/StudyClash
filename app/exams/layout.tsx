import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exam Prep Study App | SAT, AP, MCAT, LSAT, NCLEX",
  description:
    "Practice AP, MCAT, LSAT and NCLEX questions written in each exam's format, with timing to match and targeted review of whatever you keep getting wrong. SAT prep links straight to College Board's official practice tests.",
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
    title: "Exam practice | AceDecks",
    description:
      "Questions in your exam's format, and targeted review of what you keep missing.",
    url: "/exams",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AceDecks Exams | SAT, AP, MCAT, LSAT, NCLEX",
    description:
      "Exam-format practice questions, and review aimed at your weak topics.",
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
