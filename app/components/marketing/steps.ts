// The four steps of the loop, in one place.
//
// Same reasoning as faq.ts, and the same bug it was written to prevent:
// StepGrid.tsx is "use client", so a server component importing a plain
// value out of it gets a client-reference proxy rather than the array, and
// .map() on it throws during prerender.
//
// These two copies had already drifted. app/page.tsx published a HowTo
// schema describing THREE steps ("Give it anything" / "It builds
// everything" / "It keeps you honest") while the page rendered four
// differently-named ones, under a headline that says "Four steps" --
// structured data that contradicts the visible page, which is precisely
// what Google's guidelines forbid.
//
// The icon is named rather than imported so this module stays free of
// component imports and safe for the server to read; StepGrid maps the name
// to the lucide component.

export type StepIconName = "ingest" | "generate" | "detect" | "repair";

export type Step = {
  n: string;
  title: string;
  icon: StepIconName;
  badge: string;
  body: string;
  stats: Array<{ value: string; label: string }>;
};

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Ingest",
    icon: "ingest",
    badge: "Anything you have",
    body: "Drop a topic, your notes, a PDF, or a photo of the page. Everything gets parsed into concepts.",
    stats: [
      { value: "Any", label: "file type" },
      { value: "~20s", label: "to first question" },
    ],
  },
  {
    n: "02",
    title: "Generate",
    icon: "generate",
    badge: "Written from your material",
    body: "Notes, questions and flashcards written from your material — every answer validated before it reaches you.",
    stats: [
      // Describes the mechanism (lib/mistakeRecovery.ts and
      // lib/server/curriculum/questionVerification.ts both refuse a question
      // whose answer is not among its choices), not a measured outcome.
      // "0 broken questions" used to sit here, which reads as a statistic
      // nobody has measured.
      { value: "Every", label: "answer checked" },
      { value: "~20s", label: "to a full set" },
    ],
  },
  {
    n: "03",
    title: "Detect",
    icon: "detect",
    badge: "The mastery model",
    body: "Each answer updates a real mastery model: recency, difficulty, hesitation and decay.",
    stats: [
      { value: "6", label: "signals tracked" },
      { value: "Live", label: "decay modelling" },
    ],
  },
  {
    n: "04",
    title: "Repair",
    icon: "repair",
    badge: "Where the gain is",
    body: "Miss something and it names the exact misconception, then re-tests the same idea until it holds.",
    stats: [
      { value: "+30", label: "recovery XP" },
      { value: "1 tap", label: "to fix a gap" },
    ],
  },
];
