"use client";

import dynamic from "next/dynamic";

// See LazyVyraCoach.tsx for why this indirection exists: it lets the root
// layout (a Server Component) defer FeedbackButton's chunk entirely instead
// of shipping it in every page's hydration-blocking payload. FeedbackButton
// renders nothing until a custom "open feedback" event fires from deep
// inside VyraCoach's panel, so there is no visible content to lose by not
// server-rendering it.
const FeedbackButton = dynamic(() => import("./FeedbackButton"), {
  ssr: false,
});

export default FeedbackButton;
