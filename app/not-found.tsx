import Link from "next/link";

// 404.
//
// On the app's own canvas rather than a hand-rolled one, and down to two
// actions from three -- "Go Home", "Dashboard" and "Try Demo" side by side
// made the reader choose between options they had no way to tell apart. A
// visitor who hit a bad link wants the way back; that is the primary, and the
// dashboard is the quiet second for anyone already signed in.
export default function NotFound() {
  return (
    <div className="app-page" style={{ maxWidth: "34rem" }}>
      <div className="card mt-10 px-6 py-14 text-center">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "var(--text-4)" }}
        >
          404
        </p>
        <h1 className="t-page mt-3">Page not found</h1>
        <p className="t-body mx-auto mt-3 max-w-sm">
          This page doesn&rsquo;t exist, or the link has gone stale. Nothing you
          saved is affected.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/home" className="btn btn-primary">
            Back to studying
          </Link>
          <Link href="/" className="btn btn-secondary">
            Home page
          </Link>
        </div>
      </div>
    </div>
  );
}
