"use client";

import { useEffect, useRef } from "react";
import { UI_Z_INDEX } from "@/lib/uiLayout";
import { GRADIENTS } from "@/lib/theme";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

// Generalizes the modal shell previously hand-built inside FeedbackButton:
// mobile bottom-sheet / desktop centered dialog, click-outside-to-close,
// Escape-to-close, and a labeled close button. Unlike the original, Escape
// is bound at the document level while open (not just on the panel), so it
// works regardless of where focus currently is — the original only closed
// on Escape if focus happened to already be inside the dialog.
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    // Not a full focus trap (Tab can still leave the dialog), but without
    // this, opening the dialog leaves keyboard/screen-reader focus wherever
    // it was on the trigger button, so Tab from there walks through the
    // page behind the overlay instead of into the dialog that's actually
    // visible and interactive.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      style={{ zIndex: UI_Z_INDEX.modal }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0a0a12] p-5 shadow-glow-fuchsia-md sm:rounded-2xl sm:p-6 outline-none ${className || ""}`}
      >
        {title && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight">
              <span className={`${GRADIENTS.brandHeading} bg-clip-text text-transparent`}>{title}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors duration-fast hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
