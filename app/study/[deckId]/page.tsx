"use client";

import { Suspense } from "react";
import StudySession from "./StudySession";

// The shell exists only to provide the Suspense boundary useSearchParams
// requires; the session itself lives in StudySession.
export default function StudySessionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl px-5 py-16">
          <div className="skeleton h-2 w-full" />
          <div className="skeleton mt-10 h-24 w-full" />
        </div>
      }
    >
      <StudySession />
    </Suspense>
  );
}
