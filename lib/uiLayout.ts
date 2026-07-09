export const UI_Z_INDEX = {
  pageContent: 10,
  stickyHeader: 20,
  floatingAction: 40,
  vyraPanel: 55,
  modal: 70,
  toast: 80,
} as const;

// Shared placement rules for all floating actions.
// Keep these centralized so VYRA/Feedback cannot drift into overlap.
export const FLOATING_ACTION = {
  base: "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] min-h-11",
  left: "left-4 sm:left-6",
  right: "right-4",
  desktopRightRail:
    "md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2 md:flex-col md:gap-1.5 md:rounded-2xl md:px-2.5 md:py-3",
  mobileBottomPadding: "pb-28 sm:pb-24",
} as const;
