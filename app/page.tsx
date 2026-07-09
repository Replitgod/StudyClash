import Link from "next/link";
import GigglesCoach from "./components/GigglesCoach";

export default function Home() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex w-full flex-col items-center px-4 py-14 pb-28 sm:px-6 sm:py-20 sm:pb-24">
        {/* ---------- Hero Section ---------- */}
        <section className="flex w-full flex-col items-center">
          {/* Badge */}
          <div className="mb-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-8">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
            AI-POWERED STUDY BATTLES
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-center text-4xl font-black leading-tight tracking-tight sm:text-6xl md:text-7xl">
            <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Train in the arena. Build mastery with ClashPath.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 max-w-2xl text-center text-sm leading-relaxed text-white/60 sm:text-base md:text-lg">
            Upload notes, play a timed quiz, see exactly what you missed, and
            get your next best study move. New users can start the demo in
            under 60 seconds with no setup.
          </p>

          <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-center text-xs font-semibold text-cyan-100 sm:text-sm">
            New here? Tap <span className="font-black">Try Demo Battle</span> to understand StudyClash in under 30 seconds.
          </div>

          {/* CTA buttons */}
          <div className="mt-9 flex w-full max-w-xs flex-col items-stretch gap-3 sm:mt-10 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/create"
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:w-auto sm:hover:scale-105 sm:text-lg"
            >
              <span className="relative z-10">Create Battle Deck</span>
              <svg
                className="relative z-10 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            </Link>

            <Link
              href="/demo/battle"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-8 py-4 text-base font-bold text-cyan-200 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/40 hover:bg-cyan-500/15 sm:w-auto sm:text-lg"
            >
              Try Demo Battle
            </Link>

            <Link
              href="/decks"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10 sm:w-auto sm:text-lg"
            >
              View Decks
            </Link>
          </div>

          {/* Quick feature strip */}
          <div className="mt-10 flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:mt-12">
            {[
              "AI-generated questions",
              "ClashPath mastery maps",
              "Weakness rematch modes",
              "Live leaderboards",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <span className="text-xs font-semibold text-white/50 sm:text-sm">
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- How It Works Section ---------- */}
        <section className="mt-20 w-full max-w-5xl sm:mt-28">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              The Flow
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/50 sm:text-base">
              From notes to an adaptive mastery path in under a minute.
            </p>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                ),
                step: "01",
                title: "Paste or Upload",
                desc: "Paste your notes as text, or upload a PDF of your study guide.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                ),
                step: "02",
                title: "AI Creates Questions",
                desc: "15 multiple-choice questions are generated straight from your material.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                ),
                step: "03",
                title: "Play the Battle",
                desc: "Race the clock in a fast, battle-style quiz showdown.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                ),
                step: "04",
                title: "Review Weak Topics",
                desc: "ClashPath marks mastered, close, and weak topics with mastery percentages.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                ),
                step: "05",
                title: "Challenge Friends",
                desc: "Share the same battle and race your ratings on the leaderboard.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-fuchsia-400/30 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      {item.icon}
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-white/20">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-bold text-white sm:text-base">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-white/45 sm:text-sm">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Why It's Better Than Flashcards Section ---------- */}
        <section className="mt-20 w-full max-w-5xl sm:mt-28">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
              Not Just Flashcards
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Why It&apos;s A Training Arena
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/50 sm:text-base">
              Flashcards are static recall. StudyClash is adaptive competition
              with AI coaching, progression pressure, and skill recovery loops.
            </p>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2">
            {[
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                ),
                title: "Timed pressure, not passive review",
                desc: "A live timer keeps you focused and engaged, instead of slowly flipping through a static stack of cards.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                ),
                title: "AI-generated from your actual notes",
                desc: "No generic decks. Every question is built directly from the material you uploaded, so you're always studying what matters.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25"
                  />
                ),
                title: "Tells you what to fix, not just your score",
                desc: "A weak topic report breaks down exactly which concepts you missed, so review time actually closes the gap.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
                  />
                ),
                title: "Social by default",
                desc: "Every deck comes with a shareable challenge link and a live leaderboard, so studying turns into friendly competition.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.06] sm:p-6"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    {item.icon}
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white sm:text-base">
                    {item.title}
                  </h3>
                  <p className="mt-1 break-words text-xs leading-relaxed text-white/50 sm:text-sm">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Built for Students Section ---------- */}
        <section className="mt-20 w-full max-w-5xl sm:mt-28">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-300">
              Made For Studying
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Built for Students
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/50 sm:text-base">
              No account setup headaches, no clutter — just your notes turned
              into something worth studying.
            </p>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-3">
            {[
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                ),
                title: "Works with any subject",
                desc: "Chemistry, history, law, medicine — if you can write notes on it, StudyClash can quiz you on it.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                ),
                title: "PDF or paste — your choice",
                desc: "Already have a PDF study guide? Upload it directly. Prefer to paste text? That works too.",
              },
              {
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                ),
                title: "Fair usage, built to last",
                desc: "Free Beta includes daily generation limits so the app stays fast and available for everyone during the beta.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center backdrop-blur-sm transition-colors duration-200 hover:border-violet-400/30 hover:bg-white/[0.06] sm:p-6"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    {item.icon}
                  </svg>
                </div>
                <h3 className="mt-4 text-sm font-bold text-white sm:text-base">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-white/50 sm:text-sm">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-lg text-center text-xs text-white/30 sm:text-sm">
            Need more generations per day? Check out{" "}
            <Link
              href="/pricing"
              className="font-semibold text-fuchsia-300 hover:text-fuchsia-200"
            >
              Pro Preview and Founder plans
            </Link>
            .
          </p>
        </section>

        {/* ---------- Final CTA Section ---------- */}
        <section className="mt-20 flex w-full max-w-2xl flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:mt-24 sm:p-10">
          <h2 className="text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
            <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Ready to Clash?
            </span>
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/50 sm:text-base">
            Turn your next study session into a battle in under a minute.
          </p>

          <div className="mt-6 flex w-full max-w-xs flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/create"
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:w-auto sm:hover:scale-105"
            >
              <span className="relative z-10">Create Battle Deck</span>
              <svg
                className="relative z-10 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            </Link>

            <Link
              href="/decks"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10 sm:w-auto"
            >
              View Decks
            </Link>

            <Link
              href="/exams"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-8 py-4 text-base font-bold text-cyan-200 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/45 hover:bg-cyan-500/15 sm:w-auto"
            >
              Exam Tunnels
            </Link>
          </div>
        </section>

        <footer className="mt-12 flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-white/45 sm:text-sm">
          <Link href="/privacy" className="hover:text-white/80">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white/80">Terms of Use</Link>
          <Link href="/contact" className="hover:text-white/80">Contact</Link>
          <Link href="/pricing" className="hover:text-white/80">Pricing</Link>
        </footer>
      </div>

      <GigglesCoach contextLabel="Website" />
    </main>
  );
}