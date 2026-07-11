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
  // A second, higher row reserved for elements that would otherwise share
  // the same row as FeedbackButton (bottom-left) and the VYRA launcher
  // (bottom-right) below md. FloatingBattleCTA is near-full-width on mobile
  // (`w-[calc(100%-1.5rem)]`), so it cannot safely share `base`'s row with
  // either of them -- it gets its own row, stacked above.
  raisedRow: "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] min-h-11",
  left: "left-4 sm:left-6",
  right: "right-4",
  desktopRightRail:
    "md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2 md:flex-col md:gap-1.5 md:rounded-2xl md:px-2.5 md:py-3",
  // Below md, both the base row (Feedback/VYRA launcher) and the raised row
  // (FloatingBattleCTA) can be on screen at once, so page content needs to
  // clear both. Tapers down at md, where the CTA hides and VYRA's launcher
  // moves to a side rail, leaving only the base row.
  mobileBottomPadding: "pb-36 md:pb-24",
} as const;
