"use client";

import { Suspense } from "react";
import VyraChat from "./VyraChat";

// The page shell exists only to satisfy the Suspense boundary that
// useSearchParams requires; all of Vyra lives in VyraChat.
export default function VyraPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page">
          <div className="skeleton h-9 w-56" />
          <div className="skeleton mt-8 h-[120px] w-full" />
        </div>
      }
    >
      <VyraChat />
    </Suspense>
  );
}
