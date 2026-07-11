"use client";

import { forwardRef, useId } from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  children: React.ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, containerClassName, className, id, children, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id || generatedId;

  return (
    <div className={`flex flex-col gap-2 ${containerClassName || ""}`}>
      {label && (
        <label htmlFor={fieldId} className="text-xs font-bold uppercase tracking-wider text-white/60">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`w-full min-w-0 rounded-xl border bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-fast focus:ring-2 sm:py-3 sm:text-sm ${
          error
            ? "border-red-400/50 focus:border-red-400/60 focus:ring-red-500/20"
            : "border-white/10 focus:border-fuchsia-400/50 focus:ring-fuchsia-500/20"
        } ${className || ""}`}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-semibold text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-[11px] text-white/30">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
