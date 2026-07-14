// Shown instantly by Next as a Suspense fallback while the dashboard route
// compiles/streams in, instead of a blank screen -- see Next's streaming
// docs (loading.js special file). The client component's own isLoading
// state still governs the data-fetch gap after this mounts.
export default function DashboardLoading() {
  return (
    <main className="relative min-h-dvh w-full bg-[#05050a] px-4 py-10 text-white sm:px-6 sm:py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-white/10" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    </main>
  );
}
