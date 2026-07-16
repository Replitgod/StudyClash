"use client";

import { usePathname } from "next/navigation";
import { isActiveBattleRoute } from "./Navigation";

// Reserves space for the left icon rail that Navigation renders at md+ for
// every visitor, logged in or not (see app/components/Navigation.tsx). The
// rail itself stays fixed-position and expands over content on hover rather
// than pushing it, so this only needs to reserve its resting (collapsed)
// width -- not the expanded one. No reservation on an active battle route,
// since Navigation renders nothing there either.
export default function MainContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const railOffset = isActiveBattleRoute(pathname) ? "" : "md:pl-[72px]";

  return (
    <div id="main-content" className={`flex-1 ${railOffset}`}>
      {children}
    </div>
  );
}
