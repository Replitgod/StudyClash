"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GRADIENTS } from "@/lib/theme";
import { springBouncy, springSnappy } from "@/lib/motion";

const MotionLink = motion.create(Link);

export type ButtonVariant = "primary" | "battle" | "secondary" | "success" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: `${GRADIENTS.brandPrimary} text-white shadow-glow-fuchsia-sm hover:shadow-glow-fuchsia-md`,
  battle: `${GRADIENTS.battle} text-[#052538] shadow-glow-cyan-sm hover:shadow-glow-cyan-md`,
  secondary:
    "border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/45 hover:bg-cyan-500/20",
  success:
    "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/45 hover:bg-emerald-500/20",
  ghost: "border border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10",
  danger: "border border-red-400/30 bg-red-500/10 text-red-300 hover:border-red-400/45 hover:bg-red-500/15",
  /** Solid white CTA for use on top of a colored/gradient section background. */
  inverse: "bg-white text-[#052538] hover:bg-white/90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "rounded-lg px-3 py-2 text-xs",
  md: "rounded-xl px-5 py-3 text-sm",
  lg: "rounded-2xl px-7 py-3.5 text-base",
};

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
};

// framer-motion's drag/animation gesture props (onDrag, onAnimationStart,
// etc.) collide in signature with the plain DOM event handlers of the same
// name on ButtonHTMLAttributes/Link -- nobody passes drag handlers to a
// Button, so they're just omitted rather than reconciled.
type MotionConflictingProps = "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd";

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | MotionConflictingProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<React.ComponentProps<typeof Link>, keyof CommonProps | "href" | MotionConflictingProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function buildClassName(args: {
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth: boolean;
  className?: string;
}): string {
  const { variant, size, fullWidth, className } = args;
  return [
    // Scale/press feedback is owned by framer-motion (whileHover/whileTap
    // below) so it isn't fought over by two systems at once -- this class
    // list only owns color/shadow transitions.
    "inline-flex items-center justify-center gap-2 font-black transition-shadow duration-base disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
}

// A single button primitive absorbing the dozens of hand-written
// `<button className="rounded-xl bg-gradient-to-r from-... px-.. py-.. ...">`
// instances across the app. Renders a <Link> when `href` is passed (so CTAs
// that navigate don't need a separate component), otherwise a <button>.
// Built-in loading state reuses the same spinner markup that was previously
// duplicated per-component (e.g. FeedbackButton's submit button). Press/hover
// feedback is spring-based (framer-motion), not CSS transitions, so every
// consumer gets the same tactile "premium" feel for free.
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingLabel,
      fullWidth = false,
      className,
      children,
      ...rest
    } = props;

    const composedClassName = buildClassName({ variant, size, fullWidth, className });
    const isInteractive = !isLoading && !("disabled" in rest && rest.disabled);
    // Hover lifts on the crisp/snappy spring; tap "presses down" -- a
    // slight downward offset plus a brightness dip standing in for a
    // pressed shadow -- on the bouncier, lower-damping spring so the
    // release has a satisfying tactile give instead of just snapping back.
    const gesture = isInteractive
      ? {
          whileHover: { scale: 1.03, y: -1, transition: springSnappy },
          whileTap: { scale: 0.95, y: 1, filter: "brightness(0.92)", transition: springBouncy },
        }
      : {};

    if ("href" in props && props.href !== undefined) {
      const { href, ...linkRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
      return (
        <MotionLink
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          transition={springSnappy}
          {...gesture}
          className={composedClassName}
          {...linkRest}
        >
          {isLoading && <Spinner />}
          {isLoading && loadingLabel ? loadingLabel : children}
        </MotionLink>
      );
    }

    const buttonRest = rest as Omit<ButtonAsButton, keyof CommonProps | "href">;
    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        transition={springSnappy}
        {...gesture}
        className={composedClassName}
        disabled={isLoading || buttonRest.disabled}
        {...buttonRest}
      >
        {isLoading && <Spinner />}
        {isLoading && loadingLabel ? loadingLabel : children}
      </motion.button>
    );
  }
);

export { Spinner };
