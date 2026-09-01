"use client";

import Link from "next/link";
import { useEffect } from "react";

// The app had no error boundary at any level. Almost every page here is a
// client component, so a single thrown render error -- a malformed row, an
// undefined field on an API response -- took out the whole tree and left the
// student on React's blank production error screen with no way back and no
// indication that their work was safe.
//
// Written to match app/not-found.tsx: the app's own canvas, one primary
// action, and a plain statement that nothing saved was lost, because that is
// the actual question a student has when a screen breaks mid-session.
// Next 16.2 replaced `reset` with `unstable_retry`, which re-fetches the
// segment as well as re-rendering it -- the right behaviour when the cause
// was a failed load rather than bad local state (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
// `reset` is still passed and still supported, so both are accepted here:
// the retry button keeps working whichever of the two this Next version
// hands us.
export default function AppError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  useEffect(() => {
    // Next strips messages from production errors on the client and gives
    // them a digest instead; logging both is what makes a report from a
    // student traceable to a server log line.
    console.error("Unhandled render error:", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="app-page" style={{ maxWidth: "34rem" }}>
      <div className="card mt-10 px-6 py-14 text-center">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "var(--text-4)" }}
        >
          Something broke
        </p>
        <h1 className="t-page mt-3">This screen didn&rsquo;t load</h1>
        <p className="t-body mx-auto mt-3 max-w-sm">
          Your decks and progress are safe &mdash; this is a display problem, not
          a data one. Try again, and if it keeps happening tell us and we will
          fix it.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {retry && (
            <button type="button" onClick={() => retry()} className="btn btn-primary">
              Try again
            </button>
          )}
          <Link href="/home" className="btn btn-secondary">
            Back to studying
          </Link>
        </div>

        {error.digest && (
          <p className="t-meta mt-6" style={{ color: "var(--text-4)" }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
