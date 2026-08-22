"use client";

import { Suspense } from "react";
import HomeView from "./HomeView";

// The shell exists only to provide the Suspense boundary useSearchParams
// requires; Home itself lives in HomeView.
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="app-page">
          <div className="skeleton h-9 w-64" />
          <div className="skeleton mt-8 h-[140px] w-full" />
        </div>
      }
    >
      <HomeView />
    </Suspense>
  );
}
