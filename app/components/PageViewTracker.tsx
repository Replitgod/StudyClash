"use client";

import { useEffect } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/trackEvent";

// Fires a single page_view on mount. Exists so server-component pages (no
// hooks available) can still report a view without being converted to a
// client component wholesale -- drop this in as a no-render side-effect leaf.
//
// funnelEvent optionally fires a second, page-specific named event (e.g.
// "homepage_viewed") alongside the generic page_view -- lets funnel queries
// filter on event_name directly instead of metadata->>'page'.
export function PageViewTracker({ page, funnelEvent }: { page: string; funnelEvent?: AnalyticsEventName }) {
  useEffect(() => {
    void trackEvent("page_view", { page });
    if (funnelEvent) void trackEvent(funnelEvent);
  }, [page, funnelEvent]);

  return null;
}
