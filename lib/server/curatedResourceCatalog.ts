// Deterministic, zero-cost fallback resource list used when generating a
// study plan (Part 7: don't call OpenAI/live search for every task in every
// plan). Deliberately conservative -- only real, stable, well-known URLs
// that don't need per-topic verification, unlike lib/server/resourceSearch.ts
// (used on the diagnostic results page, where a live grounded search is
// worth the cost for a one-time results view). Never invents a deep link
// into a specific lesson page that hasn't been verified to exist.

export type CuratedResource = { title: string; url: string };

const SAT_GENERAL_RESOURCES: CuratedResource[] = [
  { title: "Official Digital SAT practice (College Board)", url: "https://satsuite.collegeboard.org/practice" },
  { title: "Khan Academy SAT prep (free, official College Board partner)", url: "https://www.khanacademy.org/sat" },
];

// Keyed by lowercased skill/topic substring match -- broad buckets, not an
// exhaustive per-skill map, since guaranteeing a verified deep link exists
// for every one of dozens of skill names isn't realistic without a live
// check (which is exactly what resourceSearch.ts is for).
export function getCuratedResourcesForTopic(_topic: string): CuratedResource[] {
  void _topic;
  return SAT_GENERAL_RESOURCES;
}
