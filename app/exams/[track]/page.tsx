import Link from "next/link";
import { includedInProLabel, TIERS } from "@/lib/tiers";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// One exam track.
//
// Rebuilt on the app's design system alongside /exams. Three things changed
// besides the styling:
//
// - The price is read from lib/tiers.ts. Every one of these cards hardcoded
//   "($3/mo)" long after Pro moved to $9.99.
// - "Tunnel" is gone. Practice calls this "Exam practice" and so does /exams;
//   a third name for the same thing is just something else to learn.
// - "VYRA" is written "Vyra", which is what the coach is called everywhere
//   else in the product.

type TrackDetail = {
  title: string;
  cue: string;
  depth: string;
};

const TRACK_DETAILS: Record<string, TrackDetail> = {
  // /exams/sat is in sitemap.ts and was falling through to FALLBACK, so a
  // page Google is pointed at said nothing specific about the SAT.
  //
  // The practice here is written to College Board's *published* Digital SAT
  // specification -- the four content domains, the adaptive two-module
  // shape, and the question formats they document openly. It is not, and
  // will not be, a copy of their question bank: those items are
  // copyrighted, and reusing them would put the product and every school
  // that bought it at risk. Real released tests are linked instead, which
  // is what /exams already does for every other board.
  sat: {
    title: "Digital SAT",
    cue: "Two-module adaptive sections, Reading and Writing then Math, timed like the real thing.",
    depth:
      "Vyra tracks which of the four domains keeps costing you points and rebuilds practice around it.",
  },
  mcat: {
    title: "MCAT",
    cue: "Passage-first scientific reasoning, under timed pressure.",
    depth: "Vyra follows the biochemical chains you keep losing, over time.",
  },
  lsat: {
    title: "LSAT",
    cue: "Logical flaw detection and argument structure, at speed.",
    depth: "Vyra targets the reasoning traps and pacing mistakes you repeat.",
  },
  nclex: {
    title: "NCLEX",
    cue: "Clinical priority and safety judgment.",
    depth: "Vyra highlights the decision pathways you get wrong, and retests them.",
  },
  ap: {
    title: "AP Exams",
    cue: "AP-style question stems, at classroom pacing and depth.",
    depth: "Vyra turns the standards you are weak on into targeted practice sets.",
  },
};

const FALLBACK: TrackDetail = {
  title: "Exam practice",
  cue: "Practice questions tuned to your exam's format.",
  depth: "Vyra keeps bringing back whatever you keep getting wrong.",
};

export default async function ExamTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  const detail = TRACK_DETAILS[track] || FALLBACK;
  const isUnreviewed = track === "mcat" || track === "lsat" || track === "nclex";

  return (
    <div className="app-page">
      <Link
        href="/exams"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium"
        style={{ color: "var(--text-3)" }}
      >
        <span aria-hidden="true">←</span> All exams
      </Link>

      <h1 className="t-page mt-4">{detail.title}</h1>
      <p className="t-body mt-2 max-w-2xl">{detail.cue}</p>
      <p className="t-body mt-1 max-w-2xl">{detail.depth}</p>

      <div
        className="card mt-6 max-w-2xl px-4 py-3"
        style={{
          borderColor: "rgb(255 176 32 / 0.28)",
          background: "var(--warn-soft)",
        }}
      >
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          <span className="font-medium" style={{ color: "var(--warn)" }}>
            In beta.
          </span>{" "}
          These questions are AI-generated. They are not official, and they have
          not been professionally validated.
          {isUnreviewed &&
            " Nobody with credentials in this field has checked them yet."}
        </p>
      </div>

      <section className="mt-8">
        <div
          className="card p-5 sm:p-6"
          style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
        >
          <h2 className="t-section">What it costs</h2>
          <p
            className="mt-2 text-[22px] font-medium tracking-tight"
            style={{ color: "var(--text-1)" }}
          >
            {includedInProLabel()}
          </p>
          {/* Stated from the tier's own feature list rather than the old
              "higher daily generation limits", which described caps Pro does
              not have. */}
          <p className="t-body mt-2">
            {TIERS.pro.tagline} Cancel any time from Settings.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/home?track=${encodeURIComponent(track)}`}
              className="btn btn-primary btn-lg"
            >
              Start practising
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/pricing" className="btn btn-secondary btn-lg">
              See all plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
