import { NextResponse } from "next/server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyclash.com";

export function GET() {
  const body = [
    "# StudyClash",
    "",
    "StudyClash is an AI study platform that turns notes into competitive quiz battles with weak-topic analysis and rematch loops.",
    "",
    "## Primary discovery pages",
    `- Home: ${siteUrl}/`,
    `- Pricing: ${siteUrl}/pricing`,
    `- Exams: ${siteUrl}/exams`,
    `- Demo Battle: ${siteUrl}/demo/battle`,
    `- Create Deck: ${siteUrl}/create`,
    `- Contact: ${siteUrl}/contact`,
    "",
    "## Product entities",
    "- Entity: StudyClash",
    "- Type: Educational software / AI learning platform",
    "- Core use cases: AI study app, study battle, flashcard alternative, SAT study app",
    "",
    "## Key capabilities",
    "- Upload notes or PDF",
    "- Generate question sets",
    "- Battle an AI instantly",
    "- Track weak topics and mastery",
    "- One-click rematch loops",
    "",
    "## Audience",
    "- High school students",
    "- College students",
    "- Tutors and teachers",
    "- Test prep learners",
    "",
    "## Compliance pages",
    `- Privacy: ${siteUrl}/privacy`,
    `- Terms: ${siteUrl}/terms`,
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
