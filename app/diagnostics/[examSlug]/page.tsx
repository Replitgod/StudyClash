"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import type { ModeAvailability } from "@/lib/examModes";

// Choosing how to sit one exam.
//
// This screen described exactly one exam and showed it to everybody: "the
// complete four-module structure with adaptive Module 2 routing and a
// scheduled break, ~2 hours 14 minutes." That is the Digital SAT. The ACT has
// four sections and no adaptive module, the MCAT four and no break, the
// NCLEX one section and neither -- so three of the five exams were told they
// were about to sit somebody else's test.
//
// It also had no idea how many questions existed. It read exam_definitions
// straight from the browser, which is allowed -- that table is public
// reference data -- but diagnostic_questions is RLS-closed because it holds
// every answer key, so the browser cannot count it. The blueprint says the
// ACT English section runs 50 questions; the bank holds 20. The engine
// already served 20, correctly. This screen was the part still promising 50.
//
// Everything is now read from /api/diagnostics/availability, which knows both
// the shape and the supply, and a mode the bank cannot mostly fill is not
// offered at all rather than offered and quietly under-delivered.

type ExamAvailability = {
  slug: string;
  name: string;
  provider: string;
  status: string;
  disclaimer: string;
  /** One sentence about the shape, assembled from the blueprint. */
  structure: string;
  sections: Array<{ key: string; label: string; available: number; minutes: number }>;
  modes: ModeAvailability[];
  totalPublished: number;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--app-bg)] text-white">
      <div
        className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}
      >
        {children}
      </div>
    </main>
  );
}

const MODE_COPY: Record<"quick" | "full", { title: string; tone: "cyan" | "fuchsia"; blurb: string }> = {
  quick: {
    title: "Quick Diagnostic",
    tone: "cyan",
    blurb: "A shorter, balanced sample. A faster, less precise estimate.",
  },
  full: {
    title: "Full Diagnostic",
    tone: "fuchsia",
    blurb: "The complete structure, for the most accurate estimate.",
  },
};

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export default function ExamDiagnosticPage() {
  const params = useParams();
  const router = useRouter();
  const examSlug = String(params.examSlug || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [exam, setExam] = useState<ExamAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingMode, setStartingMode] = useState<"quick" | "full" | null>(null);

  useEffect(() => {
    if (!examSlug) return;

    let cancelled = false;

    fetch(`/api/diagnostics/availability?slug=${encodeURIComponent(examSlug)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ExamAvailability | null) => {
        if (cancelled) return;
        if (!data) {
          setError("This exam diagnostic could not be found.");
        } else {
          setExam(data);
          void trackEvent("diagnostic_viewed", { examSlug });
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("This exam diagnostic could not be loaded right now.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [examSlug]);

  const handleStart = async (mode: "quick" | "full") => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/diagnostics/${examSlug}`);
      return;
    }

    setStartingMode(mode);
    setError(null);

    try {
      void trackEvent("diagnostic_started", { examSlug, mode });

      const response = await authFetch("/api/diagnostics/start", {
        method: "POST",
        body: JSON.stringify({ examSlug, mode }),
      });

      const json = await response.json();

      if (!response.ok) {
        setError(json.error || "Could not start this diagnostic.");
        setStartingMode(null);
        return;
      }

      router.push(`/diagnostics/attempt/${json.attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this diagnostic.");
      setStartingMode(null);
    }
  };

  if (isLoading || isAuthLoading) {
    return (
      <Background>
        <p className="text-sm text-white/50">Loading&hellip;</p>
      </Background>
    );
  }

  if (error && !exam) {
    return (
      <Background>
        <p className="text-sm text-red-300">{error}</p>
        <Link href="/diagnostics" className="mt-4 w-fit text-sm font-semibold text-indigo-300">
          &larr; Back to diagnostics
        </Link>
      </Background>
    );
  }

  if (!exam) return null;

  if (exam.status !== "available") {
    return (
      <Background>
        <h1 className="text-2xl font-semibold text-white">{exam.name} is not published yet</h1>
        <p className="mt-3 text-sm text-white/60">
          There is no {exam.name} question bank in AceDecks yet, so there is nothing here to sit.
          Vyra can still teach and quiz you on any {exam.name} topic out loud.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/vyra?call=1&topic=${encodeURIComponent(exam.name)}`}
            className="btn btn-primary"
          >
            Work on {exam.name} with Vyra
          </Link>
          <Link href="/diagnostics" className="btn btn-secondary">
            Other exams
          </Link>
        </div>
      </Background>
    );
  }

  const offered = exam.modes.filter((mode) => mode.offered);

  return (
    <Background>
      <Link href="/diagnostics" className="w-fit text-sm font-semibold text-indigo-300">
        &larr; Back to diagnostics
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          {exam.name} Diagnostic
        </span>
      </h1>
      <p className="mt-2 text-sm text-white/60">
        {exam.provider} &middot; {exam.structure}
      </p>

      {/* Each section with what is actually behind it, rather than what the
          blueprint asks for. A section showing 0 is a section this exam
          cannot examine yet, and saying so beats discovering it mid-attempt. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {exam.sections.map((section) => (
          <Card key={section.key} padding="sm">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              {section.label}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {section.available === 0
                ? "No questions yet"
                : `${section.available} question${section.available === 1 ? "" : "s"} available`}
            </p>
          </Card>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {offered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-200">Not enough questions yet</p>
          <p className="mt-2 text-sm text-white/70">
            {exam.name} has {exam.totalPublished} published question
            {exam.totalPublished === 1 ? "" : "s"}, which is not enough to estimate anything
            honestly. Rather than run a diagnostic that would tell you very little, this one
            stays closed until the bank is bigger.
          </p>
          <Link
            href={`/vyra?call=1&topic=${encodeURIComponent(exam.name)}`}
            className="btn btn-primary mt-4"
          >
            Work on {exam.name} with Vyra instead
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {offered.map((mode) => {
            const copy = MODE_COPY[mode.mode];
            return (
              <Card key={mode.mode} tone={copy.tone} padding="md">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                  {copy.title}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {mode.questions} question{mode.questions === 1 ? "" : "s"} &middot;{" "}
                  {minutesLabel(mode.minutes)}
                </p>
                <p className="mt-2 text-sm text-white/70">{copy.blurb}</p>

                {/* Said plainly rather than hidden. A student who was told 50
                    and given 20 stops trusting every other number here. */}
                {mode.short && (
                  <p className="mt-2 text-[12px] text-amber-300/90">
                    The real {exam.name} runs {mode.configured} questions in this format. The
                    AceDecks bank holds {mode.questions} so far, so that is what you will get.
                  </p>
                )}

                {mode.mode === "full" && (
                  <p className="mt-2 text-[11px] text-amber-300/90 sm:hidden">
                    Recommended on a laptop &mdash; the full diagnostic is timed and long, and
                    small screens make navigation harder.
                  </p>
                )}

                <Button
                  variant={mode.mode === "full" ? "primary" : "secondary"}
                  className="mt-4"
                  fullWidth
                  isLoading={startingMode === mode.mode}
                  onClick={() => handleStart(mode.mode)}
                >
                  Start {copy.title}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-[var(--text-3)]">
        {exam.disclaimer}
      </p>
    </Background>
  );
}
