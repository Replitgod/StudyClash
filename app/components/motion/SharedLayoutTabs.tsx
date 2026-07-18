"use client";

import { motion } from "motion/react";
import { springSnappy } from "@/lib/motion";

export type TabOption = { key: string; label: string };

// Tab strip with a shared-layout indicator that physically slides between
// tabs (framer/motion's `layoutId`) instead of the indicator just
// disappearing and reappearing -- the same underlying mechanism as
// WorkspaceShell's existing StaggeredGroup pattern, generalized into a
// standalone control for anywhere a tab switcher is needed (results
// breakdown views, admin filters, settings sections).
export function SharedLayoutTabs({
  options,
  activeKey,
  onChange,
  className,
  layoutId = "shared-layout-tabs-indicator",
}: {
  options: TabOption[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  layoutId?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 ${className || ""}`}>
      {options.map((option) => {
        const isActive = option.key === activeKey;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className="relative rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors duration-fast"
            aria-pressed={isActive}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-indigo-500/20 border border-indigo-400/30"
                transition={springSnappy}
              />
            )}
            <span className={`relative z-10 ${isActive ? "text-indigo-100" : "text-white/50"}`}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
