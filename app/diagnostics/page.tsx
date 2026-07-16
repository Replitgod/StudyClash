"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type ExamCard = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  status: "available" | "coming_soon" | "disabled";
  disclaimer: string;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-indigo-600/20 blur-[120px]" />
      </div>
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function DiagnosticsLandingPage() {
  const [exams, setExams] = useState<ExamCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void trackEvent("page_view", { page: "diagnostics_landing" });

    supabase
      .from("exam_definitions")
      .select("id, slug, name, provider, status, disclaimer")
      .order("status", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => {
        setExams((data || []) as ExamCard[]);
        setIsLoading(false);
      });
  }, []);

  const available = exams.filter((e) => e.status === "available");
  const comingSoon = exams.filter((e) => e.status === "coming_soon");

  return (
    <Background>
      <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.22em] text-indigo-200">
        DIAGNOSTIC CENTER
      </div>

      <h1 className="mx-auto max-w-3xl text-center text-3xl font-black tracking-tight sm:text-5xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          Real diagnostics for the exams that actually matter.
        </span>
      </h1>

      <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/60 sm:text-base">
        Take a timed, adaptive diagnostic built from an original question bank, get a skill-by-skill
        breakdown, and turn it into a study plan that runs all the way to test day.
      </p>

      {isLoading ? (
        <p className="mt-10 text-center text-sm text-white/50">Loading diagnostics...</p>
      ) : (
        <>
          <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.25em] text-green-300">Available now</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {available.length === 0 && (
              <p className="text-sm text-white/50">No diagnostics are published yet.</p>
            )}
            {available.map((exam) => (
              <Link
                key={exam.id}
                href={`/diagnostics/${exam.slug}`}
                className="rounded-2xl border border-green-400/25 bg-green-500/[0.06] p-5 backdrop-blur-sm transition-colors hover:border-green-300/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-bold text-white">{exam.name}</p>
                  <span className="rounded-full border border-green-300/40 bg-green-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-200">
                    Available
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/50">{exam.provider}</p>
                <p className="mt-3 text-sm text-white/70">
                  Quick or full-length diagnostic, adaptive modules, and a StudyClash score estimate.
                </p>
              </Link>
            ))}
          </div>

          <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.25em] text-white/40">Coming soon</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {comingSoon.map((exam) => (
              <div
                key={exam.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center backdrop-blur-sm opacity-70"
              >
                <p className="text-sm font-bold text-white">{exam.name}</p>
                <p className="mt-1 text-[11px] text-white/40">{exam.provider}</p>
              </div>
            ))}
          </div>

          {exams[0] && (
            <p className="mt-10 max-w-2xl text-center text-[11px] leading-relaxed text-white/35 mx-auto">
              {exams[0].disclaimer}
            </p>
          )}
        </>
      )}
    </Background>
  );
}
