"use client";

import { useEffect } from "react";
import { captureAttributionFromUrl } from "@/lib/marketingAttribution";

// Mounted once in the root layout so any page a visitor lands on (from a
// TikTok bio link, a Reddit post, a directory listing, etc.) captures its
// UTM params before the visitor navigates anywhere else in the app.
export function MarketingAttributionCapture() {
  useEffect(() => {
    captureAttributionFromUrl();
  }, []);

  return null;
}
