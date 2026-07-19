import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Button } from "@/app/components/ui/Button";
import { HoverLiftArticle } from "@/app/components/ui/HoverLift";
import { Reveal } from "@/app/components/ui/Reveal";

// AP is the one track aimed at this app's actual audience (high schoolers)
// and carries lower real-world stakes than a licensing/admissions exam, so
// it's shown as the primary track. MCAT/LSAT/NCLEX questions are AI-generated
// and have NOT been reviewed by anyone with subject-matter credentials in
// those fields -- getting one of those wrong is a materially bigger deal
// than an AP question, so they're deliberately shown secondary and labeled
// as unreviewed rather than presented as equally validated.
const PRIMARY_EXAM_TRACK = {
  slug: "ap",
  name: "AP Exams",
  monthly: "Included in AcedIQ Pro ($3/mo)",
  promise: "AI-generated practice questions styled after AP exam formats and scoring bands.",
  officialLabel: "Free-response questions from past AP exams",
  officialUrl: "https://apcentral.collegeboard.org/courses/past-exam-questions",
};

const UNREVIEWED_EXAM_TRACKS = [
  {
    slug: "mcat",
    name: "MCAT",
    monthly: "Included in AcedIQ Pro ($3/mo)",
    promise: "AI-generated multi-step reasoning questions with passage-heavy science prompts.",
    officialLabel: "AAMC free practice exam",
    officialUrl:
      "https://students-residents.aamc.org/prepare-mcat-exam/practice-mcat-exam-official-low-cost-products",
  },
  {
    slug: "lsat",
    name: "LSAT",
    monthly: "Included in AcedIQ Pro ($3/mo)",
    promise: "AI-generated argument structure, logical flaws, and timed pressure drills.",
    officialLabel: "LSAC free PrepTests (LawHub)",
    officialUrl: "https://www.lsac.org/lsat/prepare/official-lsat-practice-tests",
  },
  {
    slug: "nclex",
    name: "NCLEX",
    monthly: "Included in AcedIQ Pro ($3/mo)",
    promise: "AI-generated clinical judgment drills with safety-first prioritization patterns.",
    officialLabel: "Official NCLEX prep resources",
    officialUrl: "https://www.nclex.com/prepare.page",
  },
];

// SAT has no generated drill track (College Board's own released practice
// tests are already the best-in-class prep material for it) -- this card
// only ever points to College Board's official free practice, never to a
// AcedIQ-generated substitute.
const SAT_OFFICIAL_PRACTICE = {
  label: "Full-length official SAT practice tests",
  url: "https://satsuite.collegeboard.org/practice",
};

export default function ExamsLandingPage() {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[460px] w-[460px] rounded-full bg-green-500/20 blur-[130px]" />
      </div>

      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.22em] text-indigo-200">
          EXAM TUNNELS
        </div>

        <h1 className="mx-auto max-w-4xl text-center text-3xl font-black tracking-tight sm:text-5xl md:text-6xl">
          <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
            AI-generated practice, tuned to your exam&rsquo;s format.
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/60 sm:text-base">
          Pick an exam tunnel and get question formats tuned for the real test style,
          timing pressure, and remediation loops through VYRA AI Coach.
        </p>

        <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-center text-xs font-semibold text-amber-200 sm:text-sm">
          Experimental exam practice — currently in beta. Generated questions are not official or professionally validated.
        </div>

        {/* AP is the primary, prominently-marketed track -- see the comment
            on PRIMARY_EXAM_TRACK above for why. */}
        <div className="mt-10">
          <HoverLiftArticle className="mx-auto max-w-2xl rounded-2xl border border-indigo-400/25 bg-gradient-to-b from-indigo-500/10 to-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">
                  {PRIMARY_EXAM_TRACK.name}
                </p>
                <h2 className="mt-1 text-2xl font-black text-white">{PRIMARY_EXAM_TRACK.monthly}</h2>
              </div>
              <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                Pro Tunnel
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-white/70">{PRIMARY_EXAM_TRACK.promise}</p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button href={`/create?track=${PRIMARY_EXAM_TRACK.slug}`} variant="primary" className="flex-1">
                Start {PRIMARY_EXAM_TRACK.name} Drill
              </Button>
              <Button href="/pricing" variant="ghost" className="flex-1">
                Compare Plans
              </Button>
            </div>

            <a
              href={PRIMARY_EXAM_TRACK.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-white/50 underline underline-offset-2 hover:text-white/80"
            >
              {PRIMARY_EXAM_TRACK.officialLabel} ↗
            </a>
          </HoverLiftArticle>
        </div>

        {/* MCAT/LSAT/NCLEX are shown secondary and clearly labeled unreviewed
            -- these are licensing/admissions exams where a wrong AI-generated
            question is a materially bigger deal than for AP, and none of
            these question sets have been checked by anyone with actual
            subject-matter credentials in medicine, law, or nursing. */}
        <div className="mt-12">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-white/40">
            Also available — not yet reviewed by subject-matter experts
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {UNREVIEWED_EXAM_TRACKS.map((track) => (
              <HoverLiftArticle
                key={track.slug}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 opacity-80 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/50">
                      {track.name}
                    </p>
                    <h2 className="mt-1 text-lg font-black text-white/80">{track.monthly}</h2>
                  </div>
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    Unreviewed
                  </span>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-white/60">{track.promise}</p>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button href={`/create?track=${track.slug}`} variant="ghost" className="flex-1">
                    Start {track.name} Drill
                  </Button>
                </div>

                {/* Real retired/official exams are copyrighted by their issuing
                    org (AAMC, LSAC, NCSBN, College Board) -- AcedIQ never
                    hosts or reproduces them. This links straight to each org's
                    own free official practice instead. */}
                <a
                  href={track.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-white/50 underline underline-offset-2 hover:text-white/80"
                >
                  {track.officialLabel} ↗
                </a>
              </HoverLiftArticle>
            ))}
          </div>
        </div>

        <Reveal className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">SAT</p>
              <p className="mt-1 text-sm text-white/70">
                We don&rsquo;t generate SAT drills -- College Board&rsquo;s own free, official
                practice tests are the most accurate prep available, so we send you straight there.
              </p>
            </div>
            <a
              href={SAT_OFFICIAL_PRACTICE.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white/85 hover:bg-white/10"
            >
              {SAT_OFFICIAL_PRACTICE.label} ↗
            </a>
          </div>
        </Reveal>

        <Reveal className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center sm:p-6" delay={0.08}>
          <p className="text-sm text-white/70">
            Main AcedIQ flow still applies: create or try a deck, battle, review weak topics,
            rematch, improve. Exam tunnels add stricter format and higher coaching depth.
          </p>
        </Reveal>
      </div>
    </main>
  );
}
