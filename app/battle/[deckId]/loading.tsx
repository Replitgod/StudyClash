// Shown instantly by Next as a Suspense fallback while the battle route
// compiles/streams in, instead of a blank screen -- see Next's streaming
// docs (loading.js special file). The page's own isLoading state still
// governs the deck/question-fetch gap after this mounts.
export default function BattleLoading() {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-[#05050a] px-4 text-white">
      <div className="h-2 w-full max-w-md animate-pulse rounded-full bg-white/10" />
      <div className="w-full max-w-md animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="h-4 w-24 rounded bg-white/10" />
        <div className="mt-3 h-5 w-full rounded bg-white/10" />
        <div className="mt-2 h-5 w-2/3 rounded bg-white/10" />
        <div className="mt-6 flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 w-full rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    </main>
  );
}
