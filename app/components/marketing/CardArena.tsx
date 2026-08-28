"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The flashcard arena.
//
// Tilt is a damped spring toward the pointer rather than a direct mapping,
// so the card carries weight. A wrong answer fires a localised particle
// burst from the option that was clicked, shakes the card, and cracks the
// explanation open downward.
//
// The particles are DOM spans with a CSS keyframe and randomised custom
// properties, cleaned up on a timer. For roughly twenty short-lived
// elements that beats a canvas: no second render loop, no coordinate
// mapping between the card's 3D transform and a flat canvas, and they
// inherit the card's perspective for free.

const QUESTION = "Which trend increases left to right across a period?";
const CHOICES = [
  { text: "Atomic radius", correct: false },
  { text: "Electronegativity", correct: true },
  { text: "Metallic character", correct: false },
];

const EXPLANATION = {
  wrong:
    "Radius is the trend that gets taught first, so it is the one that surfaces. Both change across a period — they just move in opposite directions.",
  idea: "Going right, protons pile up while the shell stays the same. The pull on the outer electrons rises, so the atom gets smaller and grabs harder.",
  next: "Ask which way the nuclear pull is going. Anything measuring pull rises across a period; anything measuring size falls.",
};

type Particle = { id: number; x: number; y: number; dx: number; dy: number; size: number };
type Verdict = "idle" | "right" | "wrong";

const STIFFNESS = 0.085;
const DAMPING = 0.8;

export function CardArena() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [picked, setPicked] = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [shakeKey, setShakeKey] = useState(0);
  const [waveKey, setWaveKey] = useState(0);
  const particleId = useRef(0);
  const physics = useRef({ tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stage = stageRef.current;
    if (!stage) return;

    let raf = 0;

    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      physics.current.tx =
        Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width - 0.5)) * 2;
      physics.current.ty =
        Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height - 0.5)) * 2;
    };
    const onLeave = () => {
      physics.current.tx = 0;
      physics.current.ty = 0;
    };

    const tick = () => {
      const p = physics.current;
      p.vx = (p.vx + (p.tx - p.x) * STIFFNESS) * DAMPING;
      p.vy = (p.vy + (p.ty - p.y) * STIFFNESS) * DAMPING;
      p.x += p.vx;
      p.y += p.vy;
      const card = cardRef.current;
      if (card) {
        card.style.transform =
          `rotateY(${p.x * 14}deg) rotateX(${-p.y * 14}deg) rotateZ(${p.x * 2}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const burst = useCallback((originX: number, originY: number) => {
    const made: Particle[] = Array.from({ length: 22 }, () => {
      const angle = Math.random() * Math.PI * 2;
      // Biased downward and outward, like debris off an impact.
      const speed = 40 + Math.random() * 110;
      return {
        id: particleId.current++,
        x: originX,
        y: originY,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed + 30,
        size: 2 + Math.random() * 4,
      };
    });
    setParticles((prev) => [...prev, ...made]);
    const ids = new Set(made.map((p) => p.id));
    // Cleared on a timer matching the animation, so the DOM does not grow
    // unbounded across repeated attempts.
    window.setTimeout(
      () => setParticles((prev) => prev.filter((p) => !ids.has(p.id))),
      900
    );
  }, []);

  const answer = useCallback(
    (choice: (typeof CHOICES)[number], event: React.MouseEvent<HTMLButtonElement>) => {
      setPicked(choice.text);
      setVerdict(choice.correct ? "right" : "wrong");

      if (choice.correct) {
        setWaveKey((k) => k + 1);
        return;
      }

      const card = cardRef.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      if (cardRect) {
        burst(
          rect.left + rect.width / 2 - cardRect.left,
          rect.top + rect.height / 2 - cardRect.top
        );
      }
      setShakeKey((k) => k + 1);
    },
    [burst]
  );

  const reset = useCallback(() => {
    setPicked(null);
    setVerdict("idle");
  }, []);

  const borderColour =
    verdict === "right"
      ? "rgb(52 227 155 / 0.5)"
      : verdict === "wrong"
        ? "var(--accent-line)"
        : "rgb(255 255 255 / 0.1)";

  return (
    <div
      ref={stageRef}
      className="flex justify-center"
      style={{ perspective: "1300px", perspectiveOrigin: "50% 50%" }}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-[470px]"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        <div
          key={shakeKey}
          className={verdict === "wrong" ? "impact" : undefined}
        >
          <div
            className="scanlines relative overflow-visible rounded-[var(--radius-lg)] p-6 sm:p-7"
            style={{
              background:
                "linear-gradient(155deg, rgb(10 12 15 / 0.97), rgb(0 0 0 / 0.99))",
              border: `1px solid ${borderColour}`,
              boxShadow:
                verdict === "right"
                  ? "0 0 90px -26px rgb(52 227 155 / 0.6)"
                  : verdict === "wrong"
                    ? "0 0 90px -24px rgb(255 0 122 / 0.7)"
                    : "0 22px 60px -30px rgb(0 0 0 / 0.9)",
              transition: "border-color 400ms, box-shadow 400ms",
            }}
          >
            {verdict === "right" && <span key={waveKey} className="shockwave" />}

            {/* Debris */}
            {particles.map((p) => (
              <span
                key={p.id}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-[1px]"
                style={{
                  left: p.x,
                  top: p.y,
                  width: p.size,
                  height: p.size,
                  background: "var(--accent)",
                  boxShadow: "0 0 8px rgb(255 0 122 / 0.9)",
                  ["--px" as string]: `${p.dx}px`,
                  ["--py" as string]: `${p.dy}px`,
                  animation: "particle-fly 850ms cubic-bezier(0.2,0.7,0.3,1) forwards",
                }}
              />
            ))}

            <div className="tech-grid absolute inset-0 rounded-[var(--radius-lg)] opacity-25" aria-hidden="true" />

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: "var(--accent-bright)" }}
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
                  const revealed = verdict !== "idle";
                  const isPicked = picked === choice.text;
                  const showCorrect = revealed && choice.correct;
                  const showWrong = revealed && isPicked && !choice.correct;

                  return (
                    <li key={choice.text}>
                      <button
                        type="button"
                        disabled={revealed}
                        onClick={(event) => !revealed && answer(choice, event)}
                        data-cursor={revealed ? undefined : "Click to answer"}
                        className="w-full rounded-[var(--radius-md)] border px-4 py-3 text-left text-[15px] transition-all duration-300 disabled:cursor-default"
                        style={{
                          borderColor: showCorrect
                            ? "rgb(52 227 155 / 0.6)"
                            : showWrong
                              ? "var(--accent)"
                              : "rgb(255 255 255 / 0.12)",
                          background: showCorrect
                            ? "rgb(52 227 155 / 0.1)"
                            : showWrong
                              ? "var(--accent-soft)"
                              : "rgb(255 255 255 / 0.03)",
                          color: showCorrect
                            ? "#9ff0c8"
                            : showWrong
                              ? "#ffa3cd"
                              : "var(--text-1)",
                          boxShadow: showCorrect
                            ? "0 0 26px -8px rgb(52 227 155 / 0.7)"
                            : "none",
                        }}
                      >
                        {choice.text}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {verdict === "right" && (
                <div
                  className="mt-5 flex items-center gap-2.5"
                  style={{ animation: "line-rise 420ms var(--ease-premium-out) both" }}
                >
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      background: "rgb(52 227 155 / 0.12)",
                      color: "var(--neon-green)",
                      border: "1px solid rgb(52 227 155 / 0.4)",
                    }}
                  >
                    Recovered
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--text-3)" }}>
                    Mastery 62 → 74
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The card cracks open downward into the explanation */}
        {verdict === "wrong" && (
          <div className="crack-open mt-3">
            <div
              className="rounded-[var(--radius-lg)] p-5 sm:p-6"
              style={{
                border: "1px solid var(--accent-line)",
                background:
                  "linear-gradient(160deg, rgb(255 0 122 / 0.08), rgb(11 11 12 / 0.7))",
                backdropFilter: "blur(14px)",
                boxShadow: "0 0 70px -26px rgb(255 0 122 / 0.6)",
              }}
            >
              {[
                ["What went wrong", EXPLANATION.wrong, "var(--accent-bright)"],
                ["The idea", EXPLANATION.idea, "#8aa8ff"],
                ["Next time", EXPLANATION.next, "#34e39b"],
              ].map(([label, body, colour], i) => (
                <div key={label} className={i > 0 ? "mt-4" : undefined}>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: colour }}
                  >
                    {label}
                  </p>
                  <p
                    className="mt-1.5 text-[13.5px] leading-relaxed"
                    style={{ color: "var(--text-2)" }}
                  >
                    {body}
                  </p>
                </div>
              ))}

              <button
                type="button"
                onClick={reset}
                data-cursor="Try again"
                className="mt-5 text-[11px] uppercase tracking-[0.16em] underline underline-offset-4"
                style={{ color: "var(--accent-bright)" }}
              >
                Try one like this
              </button>
            </div>
          </div>
        )}

        {verdict === "right" && (
          <button
            type="button"
            onClick={reset}
            data-cursor="Again"
            className="mt-4 text-[11px] uppercase tracking-[0.16em] underline underline-offset-4"
            style={{ color: "var(--text-3)" }}
          >
            Try another
          </button>
        )}
      </div>
    </div>
  );
}
