"use client";

import dynamic from "next/dynamic";

// Thin client-component boundary so Server Component pages (e.g. the
// homepage) can code-split AND fully defer VyraCoach's chunk instead of
// including it in the SSR'd/hydration-blocking payload. `ssr: false` is
// only legal inside a "use client" file -- calling next/dynamic directly
// from a Server Component forces `ssr: true`, which still ships and
// hydrates the chunk on first load, defeating the point of deferring a
// closed-by-default chat widget off the critical path.
const VyraCoach = dynamic(() => import("./VyraCoach"), { ssr: false });

export default VyraCoach;
