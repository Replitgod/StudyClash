"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MathText } from "@/app/components/ui/MathText";
import { CheckIcon } from "@/app/components/app/Icons";
import type {
  FollowUpQuestion,
  RecoveryExplanation,
  RecoveryOutcome,
} from "@/lib/mistakeRecovery";

// What a student sees the moment they get something wrong.
//
// Three short sections and one button. The sections are deliberately
// unlabelled with jargon -- "What went wrong", "The idea", "Next time" --
// and the button does the only thing worth doing next: another question on
// the same idea, right now, while they still care about it.
//
// Everything degrades. If the explanation call fails the student still has
// the deck's own explanation above this component; if only the follow-up
// fails they still get the three sections. Nothing here can leave them
// stuck or staring at an error where feedback should be.

type Props = {
  questionId: string;
  selectedAnswer: string;
  /** The deck's own explanation, already on screen above this. */
  onOutcome?: (outcome: RecoveryOutcome) => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; explanation: RecoveryExplanation; followUp: FollowUpQuestion | null }
  | { status: "failed" };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="t-section" style={{ fontSize: "0.6875rem" }}>
        {label}
      </p>
      <p className="t-body mt-1.5" style={{ color: "var(--text-2)" }}>
        {children}
      </p>
    </div>
  );
}

export function MistakeRecovery({ questionId, selectedAnswer, onOutcome }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  // The outcome is reported exactly once per question, however many times
  // this re-renders -- double-counting a recovery would inflate mastery.
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    reportedRef.current = false;
    setState({ status: "loading" });
    setShowFollowUp(false);
    setPicked(null);
    setChecked(false);

    fetch("/api/explain-mistake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, selectedAnswer }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          status: "ready",
          explanation: {
            whatWentWrong: data.whatWentWrong,
            theIdea: data.theIdea,
            howToRecognize: data.howToRecognize,
          },
          followUp: data.followUp ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [questionId, selectedAnswer]);

  const report = useCallback(
    (outcome: RecoveryOutcome) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onOutcome?.(outcome);
    },
    [onOutcome]
  );

  if (state.status === "loading") {
    return (
      <div className="mt-5 space-y-3" aria-live="polite" aria-busy="true">
        <span className="visually-hidden">Working out what went wrong</span>
        <div className="skeleton h-3.5 w-28" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
      </div>
    );
  }

  // A failed call is silent on purpose. The deck's own explanation is
  // already above this; an error box would be noise stacked on a wrong
  // answer, and there is nothing the student could do about it.
  if (state.status === "failed") return null;

  const { explanation, followUp } = state;
  const isRight = checked && picked === followUp?.correctAnswer;

  return (
    <div
      className="rise mt-5 rounded-[var(--radius-lg)] border p-4 sm:p-5"
      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
    >
      <div className="space-y-4">
        <Section label="What went wrong">
          <MathText text={explanation.whatWentWrong} />
        </Section>
        <Section label="The idea">
          <MathText text={explanation.theIdea} />
        </Section>
        <Section label="Next time">
          <MathText text={explanation.howToRecognize} />
        </Section>
      </div>

      {followUp && !showFollowUp && (
        <button
          type="button"
          onClick={() => setShowFollowUp(true)}
          className="btn btn-secondary btn-sm mt-5"
        >
          Try one like this
        </button>
      )}

      {followUp && showFollowUp && (
        <div className="rise mt-5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <p className="text-[15.5px] leading-relaxed" style={{ color: "var(--text-1)" }}>
            <MathText text={followUp.questionText} />
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {followUp.choices.map((choice) => {
              const isPicked = picked === choice;
              const isAnswer = choice === followUp.correctAnswer;

              let style: React.CSSProperties = {
                borderColor: "var(--line-strong)",
                background: "var(--panel-raised)",
                color: "var(--text-1)",
              };
              if (checked && isAnswer) {
                style = {
                  borderColor: "rgb(52 211 153 / 0.45)",
                  background: "var(--ok-soft)",
                  color: "var(--text-1)",
                };
              } else if (checked && isPicked) {
                style = {
                  borderColor: "rgb(248 113 113 / 0.45)",
                  background: "var(--bad-soft)",
                  color: "var(--text-1)",
                };
              } else if (isPicked) {
                style = {
                  borderColor: "var(--brand-line)",
                  background: "var(--brand-soft)",
                  color: "var(--text-1)",
                };
              }

              return (
                <li key={choice}>
                  <button
                    type="button"
                    disabled={checked}
                    aria-pressed={isPicked}
                    onClick={() => setPicked(choice)}
                    className="flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-left text-[15px] leading-relaxed transition-colors disabled:cursor-default"
                    style={style}
                  >
                    <span className="min-w-0 flex-1">
                      <MathText text={choice} />
                    </span>
                    {checked && isAnswer && (
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {!checked ? (
            <button
              type="button"
              disabled={picked === null}
              onClick={() => {
                setChecked(true);
                report(picked === followUp.correctAnswer ? "recovered" : "still_wrong");
              }}
              className="btn btn-primary btn-sm mt-4"
            >
              Check
            </button>
          ) : (
            <div className="mt-4" aria-live="polite">
              <p
                className="flex items-center gap-1.5 text-[15px] font-medium"
                style={{ color: isRight ? "var(--ok)" : "var(--text-2)" }}
              >
                {isRight ? (
                  <>
                    <CheckIcon className="h-[18px] w-[18px]" />
                    Recovered
                  </>
                ) : (
                  "Not yet — this one is worth coming back to."
                )}
              </p>
              {followUp.explanation && (
                <p className="t-meta mt-1.5">
                  <MathText text={followUp.explanation} />
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
