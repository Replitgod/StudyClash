// Shown instantly by Next as a Suspense fallback while the mastery-map route
// compiles/streams in, instead of a blank screen -- see Next's streaming docs
// (loading.js special file). Shaped like the real stack so there is no layout
// jump once the client component's own data fetch swaps in.
//
// Uses `.app-page` and `.skeleton` rather than its own canvas: this route
// renders inside the app shell, so painting a full-height #05050a background
// here put a second, slightly different black underneath the sidebar.
export default function MasteryMapLoading() {
  return (
    <div className="app-page app-page-wide">
      <div className="skeleton h-9 w-44" />
      <div className="skeleton mt-8 h-[104px] w-full" />
      <div className="skeleton mt-6 h-[280px] w-full" />
      <div className="skeleton mt-4 h-[280px] w-full" />
    </div>
  );
}
