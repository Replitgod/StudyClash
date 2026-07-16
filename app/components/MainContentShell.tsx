"use client";

import { useAuth } from "@/lib/useAuth";

// Reserves space for the fixed left icon rail that Navigation renders for
// logged-in users at md+ (see app/components/Navigation.tsx). Split out as
// its own client component because the root layout is a server component
// and can't read auth state itself.
export default function MainContentShell({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const railOffset = isLoggedIn && !isLoading ? "md:pl-[72px]" : "";

  return (
    <div id="main-content" className={`flex-1 ${railOffset}`}>
      {children}
    </div>
  );
}
