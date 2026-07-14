// Shown instantly by Next as a Suspense fallback while the mastery-map
// route compiles/streams in, instead of a blank screen -- see Next's
// streaming docs (loading.js special file). Shaped like the real subject
// card stack so there's no layout jump once the client component's own
// data-fetch finishes and swaps in.
export default function MasteryMapLoading() {
  return (
    <main className="relative min-h-dvh w-full bg-[#05050a] px-4 py-10 text-white sm:px-6 sm:py-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="h-24 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
    </main>
  );
}
