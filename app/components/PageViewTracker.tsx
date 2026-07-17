"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/trackEvent";

// Fires a single page_view on mount. Exists so server-component pages (no
// hooks available) can still report a view without being converted to a
// client component wholesale -- drop this in as a no-render side-effect leaf.
export function PageViewTracker({ page }: { page: string }) {
  useEffect(() => {
    void trackEvent("page_view", { page });
  }, [page]);

  return null;
}
