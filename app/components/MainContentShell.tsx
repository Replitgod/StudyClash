"use client";

// The left icon rail (see app/components/Navigation.tsx) is now a
// hover-reveal overlay rather than a permanent gutter -- it fades in over
// content instead of pushing it, so this no longer needs to reserve space
// or read auth state. Kept as its own component so the root layout (a
// server component) has a stable place to hang the "Skip to main content"
// anchor target.
export default function MainContentShell({ children }: { children: React.ReactNode }) {
  return (
    <div id="main-content" className="flex-1">
      {children}
    </div>
  );
}
