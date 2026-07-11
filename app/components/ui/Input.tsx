"use client";

import { forwardRef, useId } from "react";

// Generalizes the `border-white/10 bg-black/30 ... focus:border-fuchsia-400/50
// focus:ring-2 focus:ring-fuchsia-500/20` field pattern that was previously
// hand-rolled per field (create page has ~10 of these). This is a thin
// wrapper around a native <input> — every prop (value, defaultValue,
// onChange, ref, etc.) passes straight through, so fields that are
// intentionally uncontrolled (e.g. the battle page's player-name input,
// kept uncontrolled on purpose to avoid a re-render per keystroke) work
// exactly the same as they did as raw <input> elements.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, containerClassName, className, id, ...rest },
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
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`w-full min-w-0 rounded-xl border bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-fast focus:ring-2 sm:py-3 sm:text-sm ${
          error
            ? "border-red-400/50 focus:border-red-400/60 focus:ring-red-500/20"
            : "border-white/10 focus:border-fuchsia-400/50 focus:ring-fuchsia-500/20"
        } ${className || ""}`}
        {...rest}
      />
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
