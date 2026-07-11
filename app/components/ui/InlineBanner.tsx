import { SURFACE } from "@/lib/theme";

export type InlineBannerVariant = "error" | "success" | "info";

const VARIANT_CLASSES: Record<InlineBannerVariant, string> = {
  error: `${SURFACE.dangerSubtle} text-red-300`,
  success: `${SURFACE.emeraldSubtle} text-emerald-300`,
  info: `${SURFACE.cyanSubtle} text-cyan-100`,
};

const VARIANT_ICON: Record<InlineBannerVariant, React.ReactNode> = {
  error: (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
};

export type InlineBannerProps = {
  variant?: InlineBannerVariant;
  children: React.ReactNode;
  className?: string;
};

// Generalizes the `border-red-400/30 bg-red-500/10` error banner (and its
// success/info counterparts) that were each hand-written per page.
export function InlineBanner({ variant = "info", children, className }: InlineBannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm animate-[slide-up-fade_0.25s_ease-brand-bounce] ${VARIANT_CLASSES[variant]} ${className || ""}`}
    >
      {VARIANT_ICON[variant]}
      <span className="break-words">{children}</span>
    </div>
  );
}
