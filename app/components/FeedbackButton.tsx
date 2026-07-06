"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setIsSubmitted(false);
    setErrorMessage(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset the form shortly after closing so it doesn't visibly reset
    // while the modal is still fading/closing.
    setTimeout(() => {
      setMessage("");
      setIsSubmitted(false);
      setErrorMessage(null);
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.from("feedback_reports").insert({
      message: message.trim(),
      page_url: window.location.href,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsSubmitted(true);
    setMessage("");
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_-8px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:bottom-6 sm:right-6 sm:hover:scale-105"
        aria-label="Send feedback"
      >
        <svg
          className="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
        Feedback
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={handleClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl border border-white/10 bg-[#0a0a12] p-5 shadow-[0_0_60px_-15px_rgba(217,70,239,0.4)] sm:rounded-2xl sm:p-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight">
                <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Send Feedback
                </span>
              </h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                aria-label="Close feedback form"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {isSubmitted ? (
              /* Success state */
              <div className="mt-6 flex flex-col items-center py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <svg
                    className="h-6 w-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-emerald-300">
                  Thanks for the feedback!
                </p>
                <button
                  onClick={handleClose}
                  className="mt-5 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/80 transition-colors duration-150 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            ) : (
              /* Feedback form */
              <form onSubmit={handleSubmit} className="mt-4">
                <label
                  htmlFor="feedbackMessage"
                  className="text-xs font-bold uppercase tracking-wider text-white/60"
                >
                  What&apos;s on your mind?
                </label>
                <textarea
                  id="feedbackMessage"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Bug reports, feature ideas, or anything else..."
                  required
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:text-sm"
                />

                {errorMessage && (
                  <p className="mt-2 break-words text-xs text-red-300">
                    {errorMessage}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:hover:scale-[1.02]"
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="h-4 w-4 flex-shrink-0 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      "Send Feedback"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-bold text-white/70 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}