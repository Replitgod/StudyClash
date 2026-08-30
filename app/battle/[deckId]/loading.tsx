// Shown instantly by Next as a Suspense fallback while the battle route
// compiles/streams in, instead of a blank screen -- see Next's streaming docs
// (loading.js special file). The page's own isLoading state still governs the
// deck/question-fetch gap after this mounts.
//
// A focus route, so it DOES own its canvas -- but it takes the canvas from
// --app-bg rather than hardcoding #05050a, which had drifted from the colour
// the rest of the app paints.
export default function BattleLoading() {
  return (
    <main
      className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 px-4"
      style={{ background: "var(--app-bg)" }}
    >
      <div className="skeleton h-2 w-full max-w-md" />
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] border p-6"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className="skeleton h-4 w-24" />
        <div className="skeleton mt-3 h-5 w-full" />
        <div className="skeleton mt-2 h-5 w-2/3" />
        <div className="mt-6 flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-11 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
