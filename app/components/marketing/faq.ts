// The homepage FAQ, in one place.
//
// Deliberately NOT inside NeonLanding.tsx. That file is "use client", and a
// server component importing a plain value out of a client module gets a
// client-reference proxy rather than the array -- .map() on it throws at
// render. app/page.tsx builds the FAQPage JSON-LD from this list and
// NeonLanding renders it, so a shared server-safe module is what lets both
// read the same copy.
//
// One source of truth matters here specifically: these used to be two separate
// arrays and they had drifted. The visible FAQ described the tiers correctly
// while the structured data Google indexes still promised "free and unlimited
// -- no daily caps, no locked modes", which stopped being true when tiers
// landed. Answers about price must match lib/tiers.ts.

export type FaqItem = { q: string; a: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What does it cost?",
    a: "Free covers 3 knowledge maps a month with 5 cards per concept — enough to prove it on your own material, no card required. Ace Pro is $9.99 a month and removes every cap, adds handwriting and large-PDF ingestion, custom themes, and the full Card Crack breakdown.",
  },
  {
    q: "Do I need to have notes?",
    a: "No. Type what you are studying — a topic like “photosynthesis” or “AP World Unit 3” — and AceDecks writes the material for you.",
  },
  {
    q: "What can I upload?",
    a: "PDFs, photos of a textbook or your own handwriting, and plain text. You can also import a Quizlet set, an Anki deck, or a Google Doc.",
  },
  {
    q: "How does it know what I am bad at?",
    a: "Every answer feeds a mastery model weighing how recently you answered, how hard the question was, how long you took, and how much has decayed since. Miss something and it returns sooner; prove it and it returns much later.",
  },
  {
    q: "How is it different from Quizlet?",
    a: "Quizlet holds your flashcards. AceDecks decides what you practise next, and tells you why. You never build a study plan or pick a mode.",
  },
];
