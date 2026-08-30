import Link from "next/link";
import { includedInProLabel } from "@/lib/tiers";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// Exam practice.
//
// Rebuilt on the app's design system: it used to paint its own #05050a
// canvas with indigo/green/amber blur halos and its own type scale, so a
// student arriving from Practice landed somewhere that looked like a
// different product.
//
// Two editorial decisions are load-bearing here and are kept exactly as they
// were:
//
// 1. AP leads. It is the track aimed at this app's actual audience and it
//    carries lower real-world stakes than a licensing or admissions exam.
// 2. MCAT / LSAT / NCLEX are shown second and labelled unreviewed, because
//    their questions are AI-generated and have NOT been checked by anyone
//    with subject-matter credentials in medicine, law, or nursing. Getting
//    one of those wrong matters more than an AP question does.
//
// The price comes from lib/tiers.ts. These cards previously hardcoded
// "($3/mo)" on every one of them, which had not been the price for some time.

type Track = {
  slug: string;
  name: string;
  promise: string;
  officialLabel: string;
  officialUrl: string;
};

const PRIMARY_TRACK: Track = {
  slug: "ap",
  name: "AP Exams",
  promise:
    "Practice questions written in the AP format, marked against AP scoring bands.",
  officialLabel: "Past free-response questions, from College Board",
  officialUrl: "https://apcentral.collegeboard.org/courses/past-exam-questions",
};

const UNREVIEWED_TRACKS: Track[] = [
  {
    slug: "mcat",
    name: "MCAT",
    promise: "Passage-heavy science prompts with multi-step reasoning.",
    officialLabel: "AAMC free practice exam",
    officialUrl:
      "https://students-residents.aamc.org/prepare-mcat-exam/practice-mcat-exam-official-low-cost-products",
  },
  {
    slug: "lsat",
    name: "LSAT",
    promise: "Argument structure, logical flaws, and timed pressure drills.",
    officialLabel: "LSAC free PrepTests (LawHub)",
    officialUrl: "https://www.lsac.org/lsat/prepare/official-lsat-practice-tests",
  },
  {
    slug: "nclex",
    name: "NCLEX",
    promise: "Clinical judgment drills with safety-first prioritisation.",
    officialLabel: "Official NCLEX prep resources",
    officialUrl: "https://www.nclex.com/prepare.page",
  },
];

// No generated SAT track: College Board's own released tests are already the
// best prep for it, so this points there instead of offering a substitute.
const SAT_OFFICIAL = {
  label: "Official full-length SAT practice tests",
  url: "https://satsuite.collegeboard.org/practice",
};

/** Links out to the exam board's own free material. Never a copy of it. */
function OfficialLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2"
      style={{ color: "var(--text-3)" }}
    >
      {label}
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export default function ExamsLandingPage() {
  return (
    <div className="app-page">
      <h1 className="t-page">Exam practice</h1>
      <p className="t-body mt-2 max-w-2xl">
        Questions written in your exam&rsquo;s format, with the timing and the
        marking to match.
      </p>

      {/* Stated once, up front, rather than repeated on every card. */}
      <div
        className="card mt-6 px-4 py-3"
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
        </p>
      </div>

      {/* ---- AP: the primary track ---- */}
      <section className="mt-8">
        <h2 className="t-section">Start here</h2>
        <div
          className="card mt-3 p-5 sm:p-6"
          style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[19px] font-medium"
                style={{ color: "var(--text-1)" }}
              >
                {PRIMARY_TRACK.name}
              </p>
              <p className="t-meta mt-1">{includedInProLabel()}</p>
            </div>
            <span className="chip chip-brand shrink-0">Pro</span>
          </div>

          <p className="t-body mt-3">{PRIMARY_TRACK.promise}</p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/home?track=${PRIMARY_TRACK.slug}`}
              className="btn btn-primary btn-lg"
            >
              Practice AP questions
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/pricing" className="btn btn-secondary btn-lg">
              See what Pro costs
            </Link>
          </div>

          <OfficialLink
            label={PRIMARY_TRACK.officialLabel}
            url={PRIMARY_TRACK.officialUrl}
          />
        </div>
      </section>

      {/* ---- The higher-stakes tracks, deliberately subordinate ---- */}
      <section className="mt-10">
        <h2 className="t-section">Also available</h2>
        <p className="t-meta mt-1">
          Nobody with credentials in these fields has checked these questions
          yet. Use them alongside the official material, not instead of it.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {UNREVIEWED_TRACKS.map((track) => (
            <article key={track.slug} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <p
                  className="text-[16px] font-medium"
                  style={{ color: "var(--text-1)" }}
                >
                  {track.name}
                </p>
                <span className="chip chip-warn shrink-0">Unreviewed</span>
              </div>
              <p className="t-body mt-2">{track.promise}</p>
              <p className="t-meta mt-2">{includedInProLabel()}</p>

              <div className="mt-auto pt-5">
                <Link
                  href={`/home?track=${track.slug}`}
                  className="btn btn-secondary w-full"
                >
                  Practice {track.name}
                </Link>
                <OfficialLink
                  label={track.officialLabel}
                  url={track.officialUrl}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---- SAT: honest about not having a track ---- */}
      <section className="mt-10">
        <h2 className="t-section">SAT</h2>
        <div className="card mt-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <p className="t-body min-w-0 flex-1">
            We don&rsquo;t write SAT questions. College Board&rsquo;s own free
            practice tests are the most accurate prep there is, so we send you
            straight there.
          </p>
          <a
            href={SAT_OFFICIAL.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary shrink-0"
          >
            {SAT_OFFICIAL.label}
            <span aria-hidden="true">↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </section>
    </div>
  );
}
