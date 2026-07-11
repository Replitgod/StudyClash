import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing For AI Study Battles",
  description:
    "See StudyClash pilot pricing with free and low-cost plans for students, tutors, and classrooms.",
  alternates: {
    canonical: "/pricing",
  },
  keywords: [
    "study app pricing",
    "AI learning platform pricing",
    "quizlet alternative pricing",
    "student study app subscription",
  ],
  openGraph: {
    title: "StudyClash Pricing | Free And Pilot Plans",
    description:
      "Compare Free Beta, Pro, Team, and Exam Tunnel pricing options.",
    url: "/pricing",
    images: ["/opengraph-image"],
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
