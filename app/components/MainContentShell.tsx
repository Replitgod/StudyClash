"use client";

import { useAuth } from "@/lib/useAuth";

// Reserves space for the left icon rail that Navigation renders for
// logged-in users at md+ (see app/components/Navigation.tsx). The rail
// itself stays fixed-position and expands over content on hover rather
// than pushing it, so this only needs to reserve its resting (collapsed)
// width -- not the expanded one.
export default function MainContentShell({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const railOffset = isLoggedIn && !isLoading ? "md:pl-[72px]" : "";

  return (
    <div id="main-content" className={`flex-1 ${railOffset}`}>
      {children}
    </div>
  );
}
