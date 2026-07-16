export const UI_Z_INDEX = {
  pageContent: 10,
  stickyHeader: 20,
  floatingAction: 40,
  vyraPanel: 55,
  modal: 70,
  toast: 80,
  // Must outrank every other tier -- it's the keyboard-focus skip-to-content
  // link, sr-only until focused, so it needs to sit above whatever's
  // currently on screen (including a toast or the VYRA panel) the instant a
  // keyboard user tabs to it.
  skipLink: 90,
} as const;

// Feedback is opened from a menu item inside the VYRA panel rather than its
// own floating launcher (see FeedbackButton.tsx/VyraCoach.tsx) -- one
// persistent floating control (VYRA) instead of two competing for the same
// corner. FeedbackButton listens for this on `window`.
export const OPEN_FEEDBACK_EVENT = "studyclash:open-feedback";

// Shared placement rules for all floating actions.
// Keep these centralized so VYRA/Feedback cannot drift into overlap.
export const FLOATING_ACTION = {
  base: "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] min-h-11",
  // A second, higher row reserved for elements that would otherwise share
  // the VYRA launcher's row (bottom-right) below md. FloatingBattleCTA is
  // near-full-width on mobile (`w-[calc(100%-1.5rem)]`), so it cannot safely
  // share `base`'s row -- it gets its own row, stacked above.
  raisedRow: "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] min-h-11",
  right: "right-4",
  desktopRightRail:
    "md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2 md:flex-col md:gap-1.5 md:rounded-2xl md:px-2.5 md:py-3",
  // Below md, both the base row (Feedback/VYRA launcher) and the raised row
  // (FloatingBattleCTA) can be on screen at once, so page content needs to
  // clear both. Tapers down at md, where the CTA hides and VYRA's launcher
  // moves to a side rail, leaving only the base row.
  //
  // The 9rem figure alone only clears the zero-safe-area case. `base` and
  // `raisedRow` both push their `bottom` offset up by
  // env(safe-area-inset-bottom) (for the home-indicator strip on notched/
  // Dynamic Island iPhones), but a plain `pb-36` never grew to match --
  // on exactly those devices the floating stack rides higher than the
  // reserved padding, and page content peeked out from behind it. This
  // mirrors that same safe-area term so the reserved space always tracks
  // where the floating row actually sits. md+ stays a plain value since
  // the raised row disappears there and safe-area insets are a mobile/
  // notch concept in practice.
  mobileBottomPadding: "pb-[calc(9rem+env(safe-area-inset-bottom,0px))] md:pb-24",
} as const;
