"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import { useLoadingTimeout } from "@/lib/useLoadingTimeout";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// The diagnostic centre.
//
// Rebuilt on the app's design system. It used to paint its own full-bleed
// background (#05050a), its own indigo blur halos and its own type scale,
// which meant a student clicking through from Practice landed on a screen
// that looked like a different product -- and the halos sat underneath the
// app sidebar rather than beside it.
//
// It now sits in `.app-page` like every other app screen: same canvas, same
// heading scale, same card. The page has one job -- pick an exam -- so the
// available ones lead and everything else is subordinate.

type ExamCard = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  status: "available" | "coming_soon" | "disabled";
  disclaimer: string;
};

/** Shown when the list cannot be loaded, or is taking too long. */
function RecoveryPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card mt-8 px-6 py-12 text-center">
      <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
        {message}
      </p>
      <p className="t-body mx-auto mt-2 max-w-sm">
        This is usually a connection blip rather than anything you did.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button type="button" onClick={onRetry} className="btn btn-primary">
          Try again
        </button>
        {/* Back to the dashboard, not to the marketing landing page: anyone
            on this screen already has an account. */}
        <Link href="/practice" className="btn btn-secondary">
          Back to Practice
        </Link>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <>
      <div className="skeleton mt-8 h-4 w-28" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="skeleton h-[132px]" />
        <div className="skeleton h-[132px]" />
      </div>
      <div className="skeleton mt-10 h-4 w-24" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div className="skeleton h-[76px]" />
        <div className="skeleton h-[76px]" />
        <div className="skeleton h-[76px]" />
      </div>
    </>
  );
}

export default function DiagnosticsLandingPage() {
  const [exams, setExams] = useState<ExamCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadTimedOut = useLoadingTimeout(isLoading);

  const fetchExams = useCallback(() => {
    setIsLoading(true);
    setLoadError(false);

    supabase
      .from("exam_definitions")
      .select("id, slug, name, provider, status, disclaimer")
      .order("status", { ascending: true })
      .order("name", { ascending: true })
      .then(
        ({ data, error }) => {
          if (error) {
            console.error("Failed to load diagnostics:", error.message);
            setLoadError(true);
          } else {
            setExams((data || []) as ExamCard[]);
          }
          setIsLoading(false);
        },
        (err: unknown) => {
          console.error(
            "Failed to load diagnostics:",
            err instanceof Error ? err.message : err
          );
          setLoadError(true);
          setIsLoading(false);
        }
      );
  }, []);

  useEffect(() => {
    void trackEvent("page_view", { page: "diagnostics_landing" });
    fetchExams();
  }, [fetchExams]);

  const available = exams.filter((e) => e.status === "available");
  const comingSoon = exams.filter((e) => e.status === "coming_soon");

  return (
    <div className="app-page">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="t-page">Diagnostics</h1>
        <Link
          href="/diagnostics/history"
          className="text-[13px] font-medium"
          style={{ color: "var(--text-3)" }}
        >
          Past results
        </Link>
      </div>
      <p className="t-body mt-2 max-w-2xl">
        A timed, adaptive test that finds every gap, then turns the result into a
        study plan that runs to test day.
      </p>

      {loadError ? (
        <RecoveryPanel
          message="We could not load your diagnostics."
          onRetry={fetchExams}
        />
      ) : isLoading ? (
        loadTimedOut ? (
          <RecoveryPanel
            message="This is taking longer than it should."
            onRetry={fetchExams}
          />
        ) : (
          <Skeletons />
        )
      ) : (
        <>
          <section className="mt-8">
            <h2 className="t-section">Ready to take</h2>
            {available.length === 0 ? (
              // An empty state that says what to do instead, rather than
              // reporting a zero and stopping.
              <div className="card mt-3 px-6 py-10 text-center">
                <p
                  className="text-[16px] font-medium"
                  style={{ color: "var(--text-1)" }}
                >
                  No diagnostics are published yet
                </p>
                <p className="t-body mx-auto mt-2 max-w-sm">
                  In the meantime, AceDecks can build practice from your own
                  material and find your weak topics that way.
                </p>
                <Link href="/home" className="btn btn-primary mt-6">
                  Add material
                </Link>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {available.map((exam) => (
                  <Link
                    key={exam.id}
                    href={`/diagnostics/${exam.slug}`}
                    className="card-link group p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[17px] font-medium"
                          style={{ color: "var(--text-1)" }}
                        >
                          {exam.name}
                        </p>
                        <p className="t-meta mt-0.5 truncate">{exam.provider}</p>
                      </div>
                      <ArrowRightIcon className="mt-1 h-[18px] w-[18px] shrink-0 opacity-50" />
                    </div>
                    <p className="t-body mt-3">
                      Quick or full-length, adaptive modules, and a score
                      estimate.
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {comingSoon.length > 0 && (
            <section className="mt-10">
              <h2 className="t-section">Not ready yet</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {comingSoon.map((exam) => (
                  <li
                    key={exam.id}
                    className="card px-4 py-3"
                    // Not a link, and styled so it does not look like one:
                    // a card a student can click that goes nowhere is worse
                    // than a card that reads as unavailable.
                  >
                    <p
                      className="truncate text-[14px] font-medium"
                      style={{ color: "var(--text-2)" }}
                    >
                      {exam.name}
                    </p>
                    <p className="t-meta truncate">{exam.provider}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {exams[0]?.disclaimer && (
            <p className="t-meta mt-10 max-w-2xl">{exams[0].disclaimer}</p>
          )}
        </>
      )}
    </div>
  );
}
