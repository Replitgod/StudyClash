import Link from "next/link";
import { includedInProLabel } from "@/lib/tiers";
import { trackAction, type ExamTrackEntry } from "@/lib/examCatalog";
import { loadExamCatalogStatus, type ExamTrackStatus } from "@/lib/server/examCatalogData";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// Exam practice.
//
// This page used to be a set of hand-written cards, and every button on it
// went to /home?track=sat -- the composer, where the student typed a topic
// and got generic AI-generated questions. Meanwhile /diagnostics had a real
// validated bank and a real timed attempt behind it. Two front doors, one of
// them decorative, and the decorative one was the one the navigation and the
// sitemap pointed at.
//
// Now every card is drawn from exam_definitions and from the count of
// published questions actually sitting behind it, and every button starts a
// real attempt. A track with no bank says so and offers the board's own free
// material instead of a button that goes somewhere unrelated.
//
// Revalidated hourly rather than rendered per request: the counts change
// when a migration or an admin publish lands, which is not often, and this
// is a public page that should be fast for a visitor who has never signed in.
export const revalidate = 3600;

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

function QuestionCount({ count }: { count: number }) {
  return (
    <p className="t-meta mt-2">
      {count.toLocaleString()} original practice question{count === 1 ? "" : "s"}, written to
      the published test specification
    </p>
  );
}

function ReadyCard({ entry }: { entry: ExamTrackStatus }) {
  const action = trackAction({
    track: entry.track,
    examStatus: entry.examStatus,
    publishedQuestions: entry.publishedQuestions,
    offeredModes: entry.modes.filter((mode) => mode.offered).length,
  });

  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
          {entry.track.name}
        </p>
        {entry.track.needsExpertReview && (
          <span className="chip chip-warn shrink-0">Unreviewed</span>
        )}
      </div>

      <p className="t-body mt-2">{entry.track.promise}</p>
      <QuestionCount count={entry.publishedQuestions} />

      <div className="mt-auto pt-5">
        {action && (
          <Link href={action.href} className="btn btn-primary w-full">
            {action.label}
            <ArrowRightIcon className="h-[18px] w-[18px]" />
          </Link>
        )}
        <Link
          href={`/exams/${entry.track.slug}`}
          className="btn btn-quiet mt-2 w-full"
        >
          How this track works
        </Link>
        <OfficialLink
          label={entry.track.officialLabel}
          url={entry.track.officialUrl}
        />
      </div>
    </article>
  );
}

function NotYetCard({ track }: { track: ExamTrackEntry }) {
  return (
    <article className="card flex flex-col p-5" style={{ opacity: 0.85 }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
          {track.name}
        </p>
        <span className="chip shrink-0">Not yet</span>
      </div>

      <p className="t-body mt-2">{track.promise}</p>
      {/* Said plainly rather than as "coming soon". A student deciding what to
          buy needs to know this track has nothing in it today. */}
      <p className="t-meta mt-2">
        There is no {track.name} question bank yet, so there is nothing here to
        practice. Vyra can still teach and quiz you on any {track.name} topic
        out loud.
      </p>

      <div className="mt-auto pt-5">
        <Link
          href={`/vyra?call=1&topic=${encodeURIComponent(track.name)}`}
          className="btn btn-secondary w-full"
        >
          Work on {track.name} with Vyra
        </Link>
        <OfficialLink label={track.officialLabel} url={track.officialUrl} />
      </div>
    </article>
  );
}

export default async function ExamsLandingPage() {
  const catalog = await loadExamCatalogStatus();

  const ready = catalog.filter((entry) =>
    trackAction({
      track: entry.track,
      examStatus: entry.examStatus,
      publishedQuestions: entry.publishedQuestions,
      // The same test the exam page applies. A card that offers practice a
      // student cannot actually sit is the disagreement this closes.
      offeredModes: entry.modes.filter((mode) => mode.offered).length,
    })
  );
  const notYet = catalog.filter((entry) => !ready.includes(entry));

  const totalQuestions = ready.reduce((sum, entry) => sum + entry.publishedQuestions, 0);

  return (
    <div className="app-page">
      <h1 className="t-page">Exam practice</h1>
      <p className="t-body mt-2 max-w-2xl">
        Questions written in your exam&rsquo;s format, with the timing and the
        marking to match. {includedInProLabel()}
      </p>

      {/* Stated once, up front, rather than repeated on every card. The
          wording matters: these are original questions written to a public
          specification, which is a different claim from "official". */}
      <div
        className="card mt-6 px-4 py-3"
        style={{
          borderColor: "rgb(255 176 32 / 0.28)",
          background: "var(--warn-soft)",
        }}
      >
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          <span className="font-medium" style={{ color: "var(--warn)" }}>
            Original questions, not official ones.
          </span>{" "}
          Every question here was written for AceDecks against each board&rsquo;s
          publicly published test specification. None of it is copied from a
          real exam, no score here is an official score, and the boards&rsquo; own
          free material is linked on every card.
        </p>
      </div>

      {ready.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-section">Ready to practice</h2>
            <p className="t-meta">
              {totalQuestions.toLocaleString()} questions across {ready.length} exam
              {ready.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ready.map((entry) => (
              <ReadyCard key={entry.track.slug} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {notYet.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">Not built yet</h2>
          <p className="t-meta mt-1">
            These do not have a question bank. They are listed so you know
            where the product actually is, not to suggest otherwise.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {notYet.map((entry) => (
              <NotYetCard key={entry.track.slug} track={entry.track} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
