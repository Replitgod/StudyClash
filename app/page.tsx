import Link from "next/link";

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

      <div className="relative z-10 flex w-full flex-col items-center px-4 py-14 sm:px-6 sm:py-20">
        {/* ---------- Hero Section ---------- */}
        <section className="flex w-full flex-col items-center">
          {/* Badge */}
          <div className="mb-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-8">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
            AI-POWERED STUDY BATTLES
          </div>

          {/* Title */}
          <h1 className="text-center text-4xl font-black tracking-tight sm:text-6xl md:text-7xl">
            <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              StudyClash
            </span>
          </h1>

          {/* Tagline */}
          <p className="mt-4 text-center text-base font-semibold text-white/90 sm:mt-5 sm:text-xl md:text-2xl">
            Turn your notes into a 90-second study battle.
          </p>

          {/* Explanation */}
          <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-white/50 sm:text-base">
            Paste your notes or upload a PDF. Our AI instantly builds a
            fast-paced multiple-choice battle, scores your run, shows you
            exactly which topics to review, and gives you a link to challenge
            your friends on the same deck.
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex w-full max-w-xs flex-col items-stretch gap-3 sm:mt-10 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/login?redirect=/create"
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
              href="/decks"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10 sm:w-auto sm:text-lg"
            >
              View Decks
            </Link>
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
              From raw notes to a finished battle in under a minute.
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
                desc: "Race the clock in a fast, 90-second multiple-choice showdown.",
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
                desc: "See exactly which topics tripped you up and what to restudy.",
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
                desc: "Share a link so friends can play the exact same deck and compete.",
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

        {/* ---------- Why It's Different Section ---------- */}
        <section className="mt-20 w-full max-w-5xl sm:mt-28">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
              Not Just Flashcards
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Why StudyClash Hits Different
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/50 sm:text-base">
              Flashcards test recall in isolation. StudyClash turns studying
              into a competitive, social, self-correcting loop.
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
                desc: "A 90-second clock keeps you focused and engaged, instead of slowly flipping through a static stack of cards.",
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
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
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
                desc: "Every deck comes with a shareable challenge link and a leaderboard, so studying turns into friendly competition.",
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

        {/* ---------- Bottom CTA ---------- */}
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
              href="/login?redirect=/create"
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
          </div>
        </section>
      </div>
    </main>
  );
}