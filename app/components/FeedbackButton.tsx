"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import { OPEN_FEEDBACK_EVENT } from "@/lib/uiLayout";
import { Modal } from "@/app/components/ui/Modal";

const FEEDBACK_DRAFT_KEY = "studyjoust_feedback_draft";

const FEEDBACK_TEMPLATES = [
  "Wrong answer marked correct",
  "Question explanation is unclear",
  "Generation took too long",
  "UI is confusing on mobile",
  "Feature request",
];

// No floating launcher of its own -- opened from the "Feedback" icon inside
// VYRA's panel (see VyraCoach.tsx's ChatPanel header) so there's exactly one
// persistent floating control on screen instead of two competing for the
// same corner. VYRA itself stays mounted during an active battle (it's a
// coaching tool, not competing chrome), so this listens everywhere rather
// than hiding on /battle/ -- hiding here would make VYRA's Feedback icon a
// dead button mid-battle.
export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpen = () => {
    try {
      const draft = window.localStorage.getItem(FEEDBACK_DRAFT_KEY);
      if (draft && !message.trim()) {
        setMessage(draft);
      }
    } catch {
      // Ignore localStorage access issues.
    }

    setIsOpen(true);
    setIsSubmitted(false);
    setErrorMessage(null);
  };

  useEffect(() => {
    window.addEventListener(OPEN_FEEDBACK_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handleOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleTemplateClick = (template: string) => {
    const nextValue = message.trim()
      ? `${message.trim()}\n- ${template}`
      : template;
    setMessage(nextValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const trimmedMessage = message.trim();
    const currentPageUrl = window.location.href;

    try {
      const { error } = await supabase.from("feedback_reports").insert({
        message: trimmedMessage,
        page_url: currentPageUrl,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
      setMessage("");

      try {
        window.localStorage.removeItem(FEEDBACK_DRAFT_KEY);
      } catch {
        // Ignore localStorage access issues.
      }

      trackEvent("feedback_submitted", {
        pageUrl: currentPageUrl,
        messageLength: trimmedMessage.length,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not submit feedback right now. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Send Feedback">
        {isSubmitted ? (
              /* Success state */
              <div className="mt-6 flex flex-col items-center py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <svg
                    className="h-6 w-6 text-green-400"
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
                <p className="mt-3 text-sm font-semibold text-green-300">
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
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {FEEDBACK_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => handleTemplateClick(template)}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-colors duration-150 hover:border-indigo-400/35 hover:bg-white/10"
                    >
                      {template}
                    </button>
                  ))}
                </div>

                <label
                  htmlFor="feedbackMessage"
                  className="text-xs font-bold uppercase tracking-wider text-white/60"
                >
                  What&apos;s on your mind?
                </label>
                <textarea
                  id="feedbackMessage"
                  value={message}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMessage(next);
                    try {
                      window.localStorage.setItem(FEEDBACK_DRAFT_KEY, next);
                    } catch {
                      // Ignore localStorage access issues.
                    }
                  }}
                  placeholder="Bug reports, feature ideas, or anything else..."
                  required
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 sm:text-sm"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-white/35">
                  <span>Tip: include what you expected and what happened.</span>
                  <span>{message.trim().length} chars</span>
                </div>

                {errorMessage && (
                  <p className="mt-2 break-words text-xs text-red-300">
                    {errorMessage}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:hover:scale-[1.02]"
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
    </Modal>
  );
}