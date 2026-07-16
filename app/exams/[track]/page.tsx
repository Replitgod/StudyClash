import Link from "next/link";
import { FLOATING_ACTION } from "@/lib/uiLayout";

const TRACK_DETAILS: Record<
  string,
  {
    title: string;
    monthly: string;
    cue: string;
    depth: string;
  }
> = {
  mcat: {
    title: "MCAT Tunnel",
    monthly: "Included in Exam Pro ($5/mo)",
    cue: "Passage-first scientific reasoning under timed pressure.",
    depth: "VYRA focuses on weak biochemical and conceptual chains over time.",
  },
  lsat: {
    title: "LSAT Tunnel",
    monthly: "Included in Exam Pro ($5/mo)",
    cue: "Logical flaw detection and argument structure speed loops.",
    depth: "VYRA targets recurring reasoning traps and pacing mistakes.",
  },
  nclex: {
    title: "NCLEX Tunnel",
    monthly: "Included in Exam Pro ($5/mo)",
    cue: "Clinical priority and safety judgment battle sequences.",
    depth: "VYRA highlights decision pathways and risk-based rematches.",
  },
  ap: {
    title: "AP Exams Tunnel",
    monthly: "Included in Exam Pro ($5/mo)",
    cue: "AP-style stem structures with classroom pacing and depth control.",
    depth: "VYRA converts weak standards into targeted rematch sets.",
  },
};

export default async function ExamTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  const detail = TRACK_DETAILS[track] || {
    title: "Exam Pro",
    monthly: "Included in Exam Pro ($5/mo)",
    cue: "High-stakes format tuning and deep remediation.",
    depth: "VYRA keeps your weak-topic recovery loop active over time.",
  };

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[120px]" />
      </div>

      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        <Link href="/exams" className="w-fit text-sm font-semibold text-indigo-300">
          &larr; Back to exam tunnels
        </Link>

        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
            {detail.title}
          </span>
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
          {detail.cue}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">
          {detail.depth}
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">
            Recommended Tier
          </p>
          <p className="mt-2 text-3xl font-black text-white">{detail.monthly}</p>
          <p className="mt-2 text-sm text-white/60">
            Includes premium queueing, deeper VYRA analysis, and high-frequency rematch loops.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/create?track=${encodeURIComponent(track)}`}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-500 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Start {track.toUpperCase()} Drill
            </Link>
            <Link
              href="/pricing"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white/85"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
