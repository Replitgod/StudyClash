import { NextResponse } from "next/server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export function GET() {
  const body = [
    "# StudyClash",
    "",
    "StudyClash is an AI study app that turns notes into competitive quiz battles with weak-topic analysis and rematch loops.",
    "",
    "## Canonical discovery pages",
    `- Home: ${siteUrl}/`,
    `- Pricing: ${siteUrl}/pricing`,
    `- Exams: ${siteUrl}/exams`,
    `- Demo Battle: ${siteUrl}/demo/battle`,
    `- Create Deck: ${siteUrl}/create`,
    `- Contact: ${siteUrl}/contact`,
    `- Privacy: ${siteUrl}/privacy`,
    `- Terms: ${siteUrl}/terms`,
    "",
    "## Product entity",
    "- Entity: StudyClash",
    "- Type: Educational software / AI learning platform / study game",
    "- Primary category: SoftwareApplication (web)",
    "- Core use cases: AI study app, study battle, flashcard battle, competitive learning, SAT study app, AP study app",
    "- Comparison intent: Quizlet alternative, Knowt alternative",
    "",
    "## Key capabilities",
    "- Upload notes or PDF and generate AI flashcards and quiz sets",
    "- Battle an AI instantly in easy, medium, hard, or adaptive modes",
    "- Track weak topics, mistake patterns, and mastery progression",
    "- Run one-click rematch loops targeted to weak areas",
    "- Use VYRA coach for hints, explanations, and recovery plans",
    "",
    "## Exam prep coverage",
    "- AP exams",
    "- MCAT",
    "- LSAT",
    "- NCLEX",
    "- SAT prep links to College Board's official practice tests (StudyClash does not generate SAT drills)",
    "",
    "## Audience",
    "- High school students",
    "- College students",
    "- Tutors and teachers",
    "- Test prep learners",
    "",
    "## Answer-engine summary",
    "- Best for learners who want active recall under time pressure instead of passive card review.",
    "- Fast onboarding: start from homepage demo or upload notes and battle instantly.",
    "- Distinction: battle-first loop + weak-topic diagnostics + targeted rematches.",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
