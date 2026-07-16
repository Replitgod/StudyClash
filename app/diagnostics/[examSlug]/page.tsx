"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type ExamSectionConfig = {
  key: string;
  label: string;
  totalQuestions: number;
  totalMinutes: number;
};

type ExamDetail = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  status: string;
  disclaimer: string;
  configuration: {
    sections?: ExamSectionConfig[];
    breakMinutesBetweenSections?: number;
    modes?: { quick?: { targetMinutes: [number, number] }; full?: { targetMinutes: number } };
  };
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function ExamDiagnosticPage() {
  const params = useParams();
  const router = useRouter();
  const examSlug = String(params.examSlug || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingMode, setStartingMode] = useState<"quick" | "full" | null>(null);

  useEffect(() => {
    if (!examSlug) return;

    supabase
      .from("exam_definitions")
      .select("id, slug, name, provider, status, disclaimer, configuration")
      .eq("slug", examSlug)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("This exam diagnostic could not be found.");
        } else {
          setExam(data as ExamDetail);
          void trackEvent("diagnostic_viewed", { examSlug });
        }
        setIsLoading(false);
      });
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
        <p className="text-sm text-white/50">Loading...</p>
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
        <h1 className="text-2xl font-black text-white">{exam.name} is coming soon</h1>
        <p className="mt-3 text-sm text-white/60">
          This diagnostic isn&apos;t published yet. Check back soon, or try the Digital SAT diagnostic in the meantime.
        </p>
        <Link href="/diagnostics" className="mt-6 w-fit text-sm font-semibold text-indigo-300">
          &larr; Back to diagnostics
        </Link>
      </Background>
    );
  }

  const sections = exam.configuration.sections || [];

  return (
    <Background>
      <Link href="/diagnostics" className="w-fit text-sm font-semibold text-indigo-300">
        &larr; Back to diagnostics
      </Link>

      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          {exam.name} Diagnostic
        </span>
      </h1>
      <p className="mt-2 text-sm text-white/60">{exam.provider}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.key} padding="sm">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">{section.label}</p>
            <p className="mt-1 text-sm text-white/70">
              {section.totalQuestions} questions &middot; {section.totalMinutes} minutes
            </p>
          </Card>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card tone="cyan" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">Quick Diagnostic</p>
          <p className="mt-2 text-sm text-white/70">
            A shorter, balanced sample across both sections. ~35-45 minutes. A faster, less precise estimate.
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            fullWidth
            isLoading={startingMode === "quick"}
            onClick={() => handleStart("quick")}
          >
            Start Quick Diagnostic
          </Button>
        </Card>

        <Card tone="fuchsia" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">Full Diagnostic</p>
          <p className="mt-2 text-sm text-white/70">
            The complete four-module structure with adaptive Module 2 routing and a scheduled break. ~2 hours
            14 minutes of test time.
          </p>
          <p className="mt-2 text-[11px] text-amber-300/90 sm:hidden">
            Recommended on a laptop -- the full diagnostic is timed and long, and small screens make module
            navigation harder.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            fullWidth
            isLoading={startingMode === "full"}
            onClick={() => handleStart("full")}
          >
            Start Full Diagnostic
          </Button>
        </Card>
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-white/35">{exam.disclaimer}</p>
    </Background>
  );
}
