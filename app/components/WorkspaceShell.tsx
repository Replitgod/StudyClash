"use client";

// Fluid workspace shell: a spacious main focus area (the active battle or
// study module) plus one modular pane for contextual AI help. The launcher
// sits on the LEFT, and opening it takes over the full screen on every
// breakpoint -- sliding in from the left to match where it was triggered,
// rather than a partial side sliver on desktop. Simpler than a
// width-animated split pane, and reads as one consistent interaction
// regardless of viewport instead of two different mechanisms.
//
// This is a layout/interaction primitive, not a battle-logic component --
// callers pass whatever they want into `focusArea` and `sidePane` (a VYRA
// coach panel, a study module, anything). Keeping it content-agnostic is
// what makes it reusable instead of a one-off screen.

import { useEffect, useId } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { UI_Z_INDEX } from "@/lib/uiLayout";

// Deliberately its own constant, not lib/motion.ts's springSmooth (260/28)
// -- close by design, but this is the exact stiffness/damping asked for the
// panel specifically, kept separate so tuning one never accidentally
// retunes the other.
const panelSpring = { type: "spring", stiffness: 240, damping: 28 } as const;
const pressSpring = { type: "spring", stiffness: 520, damping: 30, mass: 0.5 } as const;

export type WorkspaceShellProps = {
  /** The main workspace: the active quiz battle, study module, whatever. */
  focusArea: React.ReactNode;
  /** Contextual panel content -- e.g. the VYRA coach layer. */
  sidePane: React.ReactNode;
  sidePaneTitle?: string;
  isPaneOpen: boolean;
  onOpenPane: () => void;
  onClosePane: () => void;
  /** Label for the floating launcher button when the pane is closed. */
  paneLauncherLabel?: string;
  className?: string;
};

export function WorkspaceShell({
  focusArea,
  sidePane,
  sidePaneTitle = "VYRA Coach",
  isPaneOpen,
  onOpenPane,
  onClosePane,
  paneLauncherLabel = "Ask VYRA",
  className,
}: WorkspaceShellProps) {
  const titleId = useId();

  // Escape closes the pane regardless of where focus currently sits --
  // matches the convention already used by app/components/ui/Modal.tsx.
  useEffect(() => {
    if (!isPaneOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClosePane();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPaneOpen, onClosePane]);

  return (
    <div className={`relative min-h-dvh w-full ${className || ""}`}>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-10">{focusArea}</div>

      {/* Full-screen takeover on every breakpoint, sliding in from the
          left to match the launcher's position. */}
      <AnimatePresence>
        {isPaneOpen && (
          <motion.div
            key="workspace-pane-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClosePane}
            className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
            style={{ zIndex: UI_Z_INDEX.vyraPanel - 1 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPaneOpen && (
          <motion.div
            key="workspace-pane-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={panelSpring}
            className="fixed inset-0 flex flex-col border-r border-white/10 bg-[#08080f]"
            style={{ zIndex: UI_Z_INDEX.vyraPanel }}
          >
            <PaneHeader titleId={titleId} title={sidePaneTitle} onClose={onClosePane} />
            <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-5 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              {sidePane}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher: left side, only shown while the pane is closed. */}
      {!isPaneOpen && (
        <motion.button
          type="button"
          onClick={onOpenPane}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.95 }}
          transition={pressSpring}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-4 flex items-center gap-2 rounded-full border border-indigo-300/25 bg-[#08080f]/90 px-4 py-3 text-sm font-bold text-indigo-100 shadow-[0_10px_40px_-14px_rgba(79,70,229,0.55)] backdrop-blur-md"
          style={{ zIndex: UI_Z_INDEX.floatingAction }}
        >
          <VyraGlyph />
          {paneLauncherLabel}
        </motion.button>
      )}
    </div>
  );
}

function PaneHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
      <h2 id={titleId} className="text-sm font-black uppercase tracking-[0.16em] text-white/70">
        {title}
      </h2>
      <motion.button
        type="button"
        onClick={onClose}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        transition={pressSpring}
        aria-label="Close panel"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>
    </div>
  );
}

function VyraGlyph() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-indigo-300/40 bg-gradient-to-br from-indigo-400/25 to-green-500/20">
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#67E8F9" strokeWidth="1.6" />
        <circle cx="9" cy="11" r="1.3" fill="#22D3EE" />
        <circle cx="15" cy="11" r="1.3" fill="#6EE7B7" />
      </svg>
    </span>
  );
}

// ============================================================
// Focus-area building blocks
// ============================================================

/** Airy card container for content inside the focus area. */
export function WorkspaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.025] p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)] sm:p-8 ${className || ""}`}
    >
      {children}
    </div>
  );
}

/**
 * A single interactive option (quiz choice, control button) with instant
 * micro-feedback: gentle scale-up on hover, a crisp scale-down on tap.
 */
export function ChoiceButton({
  children,
  selected = false,
  disabled = false,
  onClick,
  className,
}: {
  children: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      whileHover={disabled ? undefined : { scale: 1.015, borderColor: "rgba(103,232,249,0.4)" }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={pressSpring}
      className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-indigo-300/50 bg-indigo-500/15 text-white"
          : "border-white/10 bg-white/[0.03] text-white/80"
      } ${className || ""}`}
    >
      {children}
    </motion.button>
  );
}

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: panelSpring },
};

/**
 * Renders each child with a staggered entrance that flows bottom-to-top:
 * the last (visually lowest) item animates in first, each item above it
 * following with an incremental delay, instead of the usual top-first
 * cascade.
 */
export function StaggeredGroup({
  children,
  staggerDelay = 0.07,
  className,
}: {
  children: React.ReactNode[];
  staggerDelay?: number;
  className?: string;
}) {
  const items = children;
  const count = items.length;

  return (
    <div className={className}>
      {items.map((child, index) => (
        <motion.div
          key={index}
          variants={staggerItem}
          initial="hidden"
          animate="visible"
          transition={{ ...panelSpring, delay: (count - 1 - index) * staggerDelay }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
