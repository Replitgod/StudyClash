"use client";

import { motion } from "motion/react";
import { pressable } from "@/lib/motion";

// A bare pressable primitive for arbitrary interactive elements that aren't
// a real <button>/<a> action (a custom card, an icon tile, a choice chip
// that has its own layout needs Button.tsx's variant system doesn't fit).
// For a real button, use app/components/ui/Button.tsx instead -- it has
// this same press/hover feedback built in, plus loading/disabled states,
// variants, and Link support. This component exists so that feedback isn't
// re-invented ad hoc on every custom pressable surface in the app.
export function PressableButton({
  children,
  className,
  onClick,
  disabled = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...(disabled ? {} : pressable)}
      className={`disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
    >
      {children}
    </motion.button>
  );
}
