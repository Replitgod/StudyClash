import Link from "next/link";

const EXAM_TRACKS = [
  {
    slug: "mcat",
    name: "MCAT",
    monthly: "Included in Exam Tunnel ($5/mo Pilot)",
    promise: "AAMC-style multi-step reasoning with passage-heavy science prompts.",
  },
  {
    slug: "lsat",
    name: "LSAT",
    monthly: "Included in Exam Tunnel ($5/mo Pilot)",
    promise: "Argument structure, logical flaws, and timed pressure drills.",
  },
  {
    slug: "nclex",
    name: "NCLEX",
    monthly: "Included in Exam Tunnel ($5/mo Pilot)",
    promise: "Clinical judgment drills with safety-first prioritization patterns.",
  },
  {
    slug: "ap",
    name: "AP Exams",
    monthly: "Included in Exam Tunnel ($5/mo Pilot)",
    promise: "AP-style stems and depth tuned for class exams and AP scoring bands.",
  },
];

export default function ExamsLandingPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[460px] w-[460px] rounded-full bg-emerald-500/20 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.22em] text-cyan-200">
          HIGH-STAKES EXAM TUNNEL
        </div>

        <h1 className="mx-auto max-w-4xl text-center text-3xl font-black tracking-tight sm:text-5xl md:text-6xl">
          <span className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-transparent">
            Board-style battle practice for students who cannot afford to miss.
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/60 sm:text-base">
          Pick an exam tunnel and get question formats tuned for the real test style,
          timing pressure, and remediation loops through VYRA AI Coach.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {EXAM_TRACKS.map((track) => (
            <article
              key={track.slug}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                    {track.name}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-white">{track.monthly}</h2>
                </div>
                <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                  Pro Tunnel
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-white/70">{track.promise}</p>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/create?track=${track.slug}`}
                  className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-3 text-center text-sm font-bold text-white"
                >
                  Start {track.name} Drill
                </Link>
                <Link
                  href="/pricing"
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white/85"
                >
                  Compare Plans
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center sm:p-6">
          <p className="text-sm text-white/70">
            Main StudyClash flow still applies: create or try a deck, battle, review weak topics,
            rematch, improve. Exam tunnels add stricter format and higher coaching depth.
          </p>
        </div>
      </div>
    </main>
  );
}
