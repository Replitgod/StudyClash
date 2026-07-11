import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create AI Flashcards and Study Battles From Notes",
  description:
    "Upload notes or PDF and generate AI flashcards and battle-ready quizzes instantly. StudyClash turns your material into adaptive study practice with weak-topic feedback.",
  alternates: {
    canonical: "/create",
  },
  keywords: [
    "create quiz from notes",
    "AI notes to questions",
    "study deck generator",
    "PDF to quiz",
    "AI flashcards",
    "study game",
  ],
  openGraph: {
    title: "Create AI Flashcards From Notes | StudyClash",
    description:
      "Upload your notes and generate a battle-ready AI study deck in minutes.",
    url: "/create",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Study Deck From Notes | StudyClash",
    description:
      "Turn PDF or text notes into AI-generated study battles.",
    images: ["/twitter-image"],
  },
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
