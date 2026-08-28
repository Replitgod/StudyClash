"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// The interactive flashcard.
//
// Tilt follows the pointer through a spring rather than mapping straight to
// cursor position: a direct mapping feels like a sticker glued to the
// mouse, while a light spring gives the card mass. Integrated in a single
// rAF loop that writes one transform.
//
// Answering is real: pick right and the card emits a shockwave and flips to
// the explanation; pick wrong and it opens the same recovery panel the
// product actually shows, because inventing a nicer one for the marketing
// site would be selling something that does not exist.

const QUESTION = "Which trend increases left to right across a period?";
const CHOICES = [
  { text: "Atomic radius", correct: false },
  { text: "Electronegativity", correct: true },
  { text: "Metallic character", correct: false },
];

const WRONG_EXPLANATION =
  "Radius is the trend that gets taught first, so it is the one that comes to mind. Both change across a period — they just move in opposite directions.";

type Verdict = "idle" | "right" | "wrong";

/** Spring constants. Stiffness/damping tuned for a heavy card, not a spring toy. */
const STIFFNESS = 0.09;
const DAMPING = 0.82;

export function Flashcard3D() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [picked, setPicked] = useState<string | null>(null);
  const [waveKey, setWaveKey] = useState(0);
  const reduced = useReducedMotion();

  // Physics state kept in a ref: this updates every frame and must never
  // trigger a React render.
  const physics = useRef({ tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 });

  useEffect(() => {
    if (reduced) return;
    const stage = stageRef.current;
    if (!stage) return;

    let frame = 0;

    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      // -1..1 from the centre of the card.
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      physics.current.tx = Math.max(-1, Math.min(1, nx)) * 2;
      physics.current.ty = Math.max(-1, Math.min(1, ny)) * 2;
    };

    const onLeave = () => {
      physics.current.tx = 0;
      physics.current.ty = 0;
    };

    const tick = () => {
      const p = physics.current;
      // Critically-ish damped spring toward the target, integrated per frame.
      p.vx = (p.vx + (p.tx - p.x) * STIFFNESS) * DAMPING;
      p.vy = (p.vy + (p.ty - p.y) * STIFFNESS) * DAMPING;
      p.x += p.vx;
      p.y += p.vy;

      const card = cardRef.current;
      if (card) {
        card.style.transform = [
          `rotateY(${p.x * 13}deg)`,
          `rotateX(${-p.y * 13}deg)`,
          // A touch of Z-roll is what sells it as a physical object rather
          // than a plane being tipped.
          `rotateZ(${p.x * 2.2}deg)`,
          `translateZ(0)`,
        ].join(" ");
      }
      frame = requestAnimationFrame(tick);
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const answer = useCallback((choice: (typeof CHOICES)[number]) => {
    setPicked(choice.text);
    setVerdict(choice.correct ? "right" : "wrong");
    if (choice.correct) setWaveKey((k) => k + 1);
  }, []);

  const reset = useCallback(() => {
    setPicked(null);
    setVerdict("idle");
  }, []);

  return (
    <div className="stage flex justify-center" ref={stageRef}>
      <div
        ref={cardRef}
        className="stage-3d relative w-full max-w-[460px]"
        style={{ transition: reduced ? undefined : undefined }}
      >
        <div
          className="scanlines relative overflow-hidden rounded-[var(--radius-lg)] p-6 sm:p-7"
          style={{
            background:
              "linear-gradient(155deg, rgb(14 17 21 / 0.96), rgb(5 5 6 / 0.99))",
            border: `1px solid ${
              verdict === "right"
                ? "rgb(180 255 57 / 0.5)"
                : verdict === "wrong"
                  ? "rgb(255 61 110 / 0.45)"
                  : "rgb(43 217 255 / 0.22)"
            }`,
            boxShadow:
              verdict === "right"
                ? "0 0 80px -22px rgb(180 255 57 / 0.7)"
                : verdict === "wrong"
                  ? "0 0 80px -24px rgb(255 61 110 / 0.55)"
                  : "0 0 70px -28px rgb(43 217 255 / 0.6)",
            transition: "border-color 400ms, box-shadow 400ms",
          }}
        >
          {verdict === "right" && <span key={waveKey} className="shockwave" />}

          <div className="tech-grid absolute inset-0 opacity-25" aria-hidden="true" />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--neon-blue)" }}
              >
                Chemistry · Periodic Trends
              </span>
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: "var(--text-4)" }}
              >
                04/12
              </span>
            </div>

            <p
              className="mt-5 text-[19px] leading-snug"
              style={{ color: "var(--text-1)" }}
            >
              {QUESTION}
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {CHOICES.map((choice) => {
                const isPicked = picked === choice.text;
                const revealed = verdict !== "idle";
                const showCorrect = revealed && choice.correct;
                const showWrong = revealed && isPicked && !choice.correct;

                return (
                  <li key={choice.text}>
                    <button
                      type="button"
                      onClick={() => !revealed && answer(choice)}
                      disabled={revealed}
                      data-cursor={revealed ? undefined : "Answer"}
                      className="w-full rounded-[var(--radius-md)] border px-4 py-3 text-left text-[15px] transition-all duration-300 disabled:cursor-default"
                      style={{
                        borderColor: showCorrect
                          ? "rgb(180 255 57 / 0.6)"
                          : showWrong
                            ? "rgb(255 61 110 / 0.6)"
                            : "rgb(255 255 255 / 0.12)",
                        background: showCorrect
                          ? "rgb(180 255 57 / 0.12)"
                          : showWrong
                            ? "rgb(255 61 110 / 0.12)"
                            : "rgb(255 255 255 / 0.03)",
                        color: showCorrect
                          ? "#dcffa6"
                          : showWrong
                            ? "#ffb3c6"
                            : "var(--text-1)",
                        boxShadow: showCorrect
                          ? "0 0 24px -8px rgb(180 255 57 / 0.8)"
                          : "none",
                      }}
                    >
                      {choice.text}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Cybernetic recovery panel — the real one, not a nicer fiction */}
            {verdict === "wrong" && (
              <div
                className="mt-5 overflow-hidden rounded-[var(--radius-md)] border"
                style={{
                  borderColor: "rgb(255 61 110 / 0.35)",
                  background: "rgb(255 61 110 / 0.07)",
                  animation: "line-rise 420ms var(--ease-premium-out) both",
                }}
              >
                <div
                  className="flex items-center gap-2 border-b px-4 py-2"
                  style={{ borderColor: "rgb(255 61 110 / 0.25)" }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--neon-decay)" }}
                  />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: "#ff9ab5" }}
                  >
                    What went wrong
                  </span>
                </div>
                <p
                  className="px-4 py-3 text-[13.5px] leading-relaxed"
                  style={{ color: "var(--text-2)" }}
                >
                  {WRONG_EXPLANATION}
                </p>
              </div>
            )}

            {verdict === "right" && (
              <div
                className="mt-5 flex items-center gap-2.5"
                style={{ animation: "line-rise 420ms var(--ease-premium-out) both" }}
              >
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{
                    background: "rgb(180 255 57 / 0.14)",
                    color: "var(--neon-green)",
                    border: "1px solid rgb(180 255 57 / 0.4)",
                  }}
                >
                  Recovered
                </span>
                <span className="text-[13px]" style={{ color: "var(--text-3)" }}>
                  Mastery 62 → 74
                </span>
              </div>
            )}

            {verdict !== "idle" && (
              <button
                type="button"
                onClick={reset}
                data-cursor="Again"
                className="mt-5 text-[12px] uppercase tracking-[0.14em] underline underline-offset-4"
                style={{ color: "var(--text-3)" }}
              >
                Try another
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
