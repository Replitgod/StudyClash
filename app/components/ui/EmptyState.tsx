import Link from "next/link";
import { SURFACE } from "@/lib/theme";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

// A consistent "nothing here yet" pattern for decks/matches/notifications/etc,
// instead of every page hand-writing its own empty-state copy and layout.
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl ${SURFACE.neutralSubtle} px-6 py-10 text-center backdrop-blur-sm ${className || ""}`}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-500/10 text-cyan-200">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-white/85">{title}</p>
      {description && <p className="max-w-sm text-sm text-white/50">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-2 inline-flex items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-bold text-cyan-100 transition-colors duration-fast hover:border-cyan-300/45 hover:bg-cyan-500/20"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-bold text-cyan-100 transition-colors duration-fast hover:border-cyan-300/45 hover:bg-cyan-500/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
