import Link from "next/link";
import { notFound } from "next/navigation";
import { includedInProLabel, TIERS } from "@/lib/tiers";
import { findExamTrack, trackAction } from "@/lib/examCatalog";
import { moduleSize } from "@/lib/examBlueprint";
import { loadExamTrackStatus } from "@/lib/server/examCatalogData";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// One exam track.
//
// This page used to be three hand-written sentences and a price, and its
// only button went to /home?track=mcat -- the topic composer, not the MCAT.
// A student who clicked MCAT on /exams arrived at a card about the MCAT and
// left with an empty text box.
//
// Everything on it is now read from the exam's own row: the sections it has,
// how long each runs, how many original questions sit behind it, and whether
// there is anything to practice at all. The primary button starts a real
// attempt out of the real bank.
export const revalidate = 3600;

/** Every track has a page, and every page is in the sitemap. */
export function generateStaticParams() {
  return [
    { track: "sat" },
    { track: "act" },
    { track: "nclex" },
    { track: "mcat" },
    { track: "gre" },
    { track: "ap" },
    { track: "lsat" },
  ];
}

export default async function ExamTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track: slug } = await params;
  const track = findExamTrack(slug);

  // A URL naming an exam that does not exist is a 404, not a page about
  // "Exam practice" in general. The old fallback rendered generic copy for
  // any string at all, which put an indexable page at /exams/anything.
  if (!track) notFound();

  const status = await loadExamTrackStatus(track.slug);
  const publishedQuestions = status?.publishedQuestions ?? 0;
  const blueprint = status?.blueprint ?? null;

  const action = trackAction({
    track,
    examStatus: status?.examStatus,
    publishedQuestions,
  });

  return (
    <div className="app-page">
      <Link
        href="/exams"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium"
        style={{ color: "var(--text-3)" }}
      >
        <span aria-hidden="true">←</span> All exams
      </Link>

      <h1 className="t-page mt-4">{track.name}</h1>
      <p className="t-body mt-2 max-w-2xl">{track.promise}</p>

      {/* The disclaimer comes from the exam's own row, so it names that
          exam's board and no other. Every row used to carry one sentence
          listing every board at once, which read as boilerplate. */}
      {status?.disclaimer && (
        <div
          className="card mt-6 max-w-2xl px-4 py-3"
          style={{
            borderColor: "rgb(255 176 32 / 0.28)",
            background: "var(--warn-soft)",
          }}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            {status.disclaimer}
            {track.needsExpertReview &&
              " Nobody with professional credentials in this field has reviewed these questions."}
          </p>
        </div>
      )}

      {action ? (
        <section className="mt-8">
          <div
            className="card p-5 sm:p-6"
            style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
          >
            <h2 className="t-section">Start practicing</h2>
            <p
              className="mt-2 text-[22px] font-medium tracking-tight"
              style={{ color: "var(--text-1)" }}
            >
              {publishedQuestions.toLocaleString()} original questions
            </p>
            <p className="t-body mt-2">
              Marked against the same domains the real test reports on, so a
              weak domain here is the domain you are weak in there. {TIERS.pro.tagline}{" "}
              {includedInProLabel()}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link href={action.href} className="btn btn-primary btn-lg">
                {action.label}
                <ArrowRightIcon className="h-[18px] w-[18px]" />
              </Link>
              <Link
                href={`/vyra?call=1&topic=${encodeURIComponent(track.name)}`}
                className="btn btn-secondary btn-lg"
              >
                Talk it through with Vyra
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-8">
          <div className="card p-5 sm:p-6">
            <h2 className="t-section">No question bank yet</h2>
            <p className="t-body mt-2">
              There is no {track.name} bank in AceDecks today, so there is
              nothing here to practice and this page is not going to pretend
              otherwise. Vyra can still teach and quiz you on any {track.name}{" "}
              topic out loud, and the board&rsquo;s own free material is the
              right place for real questions.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/vyra?call=1&topic=${encodeURIComponent(track.name)}`}
                className="btn btn-primary btn-lg"
              >
                Work on {track.name} with Vyra
              </Link>
              <a
                href={track.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-lg"
              >
                {track.officialLabel}
              </a>
            </div>
          </div>
        </section>
      )}

      {/* What the exam actually looks like, from its blueprint rather than
          from prose somebody has to remember to update. */}
      {blueprint && action && (
        <section className="mt-10">
          <h2 className="t-section">How the test is built</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-[14px]">
              <thead>
                <tr style={{ color: "var(--text-3)" }}>
                  <th className="py-2 pr-4 text-left font-medium">Section</th>
                  <th className="py-2 pr-4 text-right font-medium">Questions</th>
                  <th className="py-2 pr-4 text-right font-medium">Minutes</th>
                  <th className="py-2 text-right font-medium">Scored</th>
                </tr>
              </thead>
              <tbody>
                {blueprint.sections.map((section) => {
                  const full = moduleSize(blueprint, section.key, 1, "full");
                  const total = section.modules.reduce((sum, m) => sum + m.questions, 0);
                  const minutes = section.modules.reduce((sum, m) => sum + m.minutes, 0);
                  return (
                    <tr
                      key={section.key}
                      style={{ borderTop: "1px solid var(--line)", color: "var(--text-2)" }}
                    >
                      <td className="py-2.5 pr-4">
                        {section.label}
                        {section.modules.length > 1 && (
                          <span className="t-meta"> · {section.modules.length} modules</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {total || full.questions}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {minutes || full.minutes}
                      </td>
                      <td className="py-2.5 text-right">
                        {section.score
                          ? `${section.score.min}–${section.score.max}${
                              section.inComposite ? "" : " (not in composite)"
                            }`
                          : "Not scored"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="t-meta mt-3">
            AceDecks estimates a score range from how you answer, using its own
            transparent model. It is not the board&rsquo;s scoring algorithm and
            it is not an official score.
          </p>
        </section>
      )}

      <section className="mt-10">
        <a
          href={track.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2"
          style={{ color: "var(--text-3)" }}
        >
          {track.officialLabel}
          <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </section>
    </div>
  );
}
