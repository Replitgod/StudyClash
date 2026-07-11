"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { GRADIENTS, TRANSITIONS } from "@/lib/theme";

export type ButtonVariant = "primary" | "battle" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: `${GRADIENTS.brandPrimary} text-white shadow-glow-fuchsia-sm hover:shadow-glow-fuchsia-md`,
  battle: `${GRADIENTS.battle} text-[#052538] shadow-glow-cyan-sm hover:shadow-glow-cyan-md`,
  secondary:
    "border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/45 hover:bg-cyan-500/20",
  ghost: "border border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10",
  danger: "border border-red-400/30 bg-red-500/10 text-red-300 hover:border-red-400/45 hover:bg-red-500/15",
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

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<React.ComponentProps<typeof Link>, keyof CommonProps | "href"> & {
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
    "inline-flex items-center justify-center gap-2 font-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
    TRANSITIONS.pressable,
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
// duplicated per-component (e.g. FeedbackButton's submit button).
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

    if ("href" in props && props.href !== undefined) {
      const { href, ...linkRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={composedClassName}
          {...linkRest}
        >
          {isLoading && <Spinner />}
          {isLoading && loadingLabel ? loadingLabel : children}
        </Link>
      );
    }

    const buttonRest = rest as Omit<ButtonAsButton, keyof CommonProps | "href">;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={composedClassName}
        disabled={isLoading || buttonRest.disabled}
        {...buttonRest}
      >
        {isLoading && <Spinner />}
        {isLoading && loadingLabel ? loadingLabel : children}
      </button>
    );
  }
);

export { Spinner };
