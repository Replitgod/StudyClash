"use client";

import { forwardRef, useId } from "react";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Shows a live "N / max chars" counter under the field, e.g. FeedbackButton's message field. */
  maxCharCount?: number;
  currentCharCount?: number;
  containerClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, maxCharCount, currentCharCount, containerClassName, className, id, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const showCounter = typeof maxCharCount === "number" && typeof currentCharCount === "number";

  return (
    <div className={`flex flex-col gap-2 ${containerClassName || ""}`}>
      {(label || showCounter) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={fieldId} className="text-xs font-bold uppercase tracking-wider text-white/60">
              {label}
            </label>
          )}
          {showCounter && (
            <span className="text-[11px] text-white/35">
              {currentCharCount} / {maxCharCount}
            </span>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`w-full min-w-0 resize-y rounded-xl border bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-fast focus:ring-2 sm:py-3 sm:text-sm ${
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
