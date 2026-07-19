import { FLOATING_ACTION } from "@/lib/uiLayout";

type PageBackgroundProps = {
  children: React.ReactNode;
  /** Light marketing canvas vs dark app canvas. */
  variant?: "dark" | "light";
  className?: string;
  contentClassName?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
};

const MAX_WIDTH: Record<NonNullable<PageBackgroundProps["maxWidth"]>, string> = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-[1200px]",
  full: "max-w-none",
};

/** Shared page canvas — replaces duplicated Background wrappers across routes. */
export function PageBackground({
  children,
  variant = "dark",
  className = "",
  contentClassName = "",
  maxWidth = "lg",
}: PageBackgroundProps) {
  const isDark = variant === "dark";

  return (
    <main
      className={`relative min-h-dvh w-full overflow-x-hidden ${
        isDark ? "bg-background text-foreground" : "bg-marketing-bg text-marketing-text"
      } ${className}`}
    >
      {isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-brand-primary/15 blur-[120px]" />
            <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-brand-accent/10 blur-[120px]" />
            <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-brand-primary/10 blur-[130px]" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
            aria-hidden="true"
          />
        </>
      )}

      <div
        className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col px-4 py-10 sm:px-6 sm:py-16 ${MAX_WIDTH[maxWidth]} ${FLOATING_ACTION.mobileBottomPadding} ${contentClassName}`}
      >
        {children}
      </div>
    </main>
  );
}
