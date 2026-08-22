"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

// Fluid progress engine -- an SVG arc whose fill is driven by GSAP with an
// `elastic.out` ease. Animating stroke-dashoffset (a single scalar) rather
// than redrawing a path keeps it GPU-cheap.
//
// The elastic ease is the whole point: the arc springs slightly PAST its
// target and settles back, and that little overshoot is what makes a
// mastery/XP gain read as celebratory instead of mechanical -- the same
// reason a physical dial has a bit of bounce when it lands. The center
// number is clamped to the true target so the readout never displays a
// value higher than reality even while the ring visually overshoots.
export function ProgressRing({
  value,
  max = 100,
  size = 128,
  strokeWidth = 10,
  tone = "brand",
  label,
  sublabel,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  /** brand = violet→indigo (in progress); success = emerald (mastered/complete). */
  tone?: "brand" | "success";
  /** Optional override for the big center text; defaults to the live percent. */
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const targetPercent = Math.round(pct * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const circleRef = useRef<SVGCircleElement>(null);
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    const circle = circleRef.current;
    if (reducedMotion) {
      setDisplayPercent(targetPercent);
      if (circle) circle.style.strokeDashoffset = String(circumference * (1 - pct));
      return;
    }

    // Tween a proxy scalar and mirror it onto both the arc and the readout,
    // so the sweep and the count are driven by one source and can never
    // drift apart.
    const proxy = { p: 0 };
    const tween = gsap.to(proxy, {
      p: pct,
      duration: 1.1,
      ease: "elastic.out(1, 0.6)",
      onUpdate: () => {
        if (circle) circle.style.strokeDashoffset = String(circumference * (1 - proxy.p));
        setDisplayPercent(Math.min(targetPercent, Math.round(proxy.p * 100)));
      },
    });
    return () => {
      tween.kill();
    };
  }, [pct, targetPercent, circumference, reducedMotion]);

  const gradientId = `progress-ring-${tone}`;
  const stops =
    tone === "success"
      ? { from: "#34D399", to: "#10B981", glow: "rgb(16 185 129 / 0.55)" }
      : { from: "#C084FC", to: "#6366F1", glow: "rgb(168 85 247 / 0.55)" };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className || ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={stops.from} />
            <stop offset="1" stopColor={stops.to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          style={{ filter: `drop-shadow(0 0 6px ${stops.glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold tabular-nums text-white">
          {label ?? `${displayPercent}%`}
        </span>
        {sublabel ? (
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
