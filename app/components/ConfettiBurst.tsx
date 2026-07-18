"use client";

type ConfettiBurstProps = {
  show: boolean;
};

const PIECES = Array.from({ length: 16 }, (_, index) => index);

export default function ConfettiBurst({ show }: ConfettiBurstProps) {
  if (!show) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((piece) => (
        <span
          key={piece}
          className="absolute top-0 h-2.5 w-1.5 rounded-full"
          style={{
            left: `${6 + piece * 6}%`,
            // On-brand: indigo (primary) / green (accent) / amber (streak-heat
            // accent) -- was previously a leftover cyan/pink/emerald trio from
            // the old battle palette that no longer exists anywhere else.
            background:
              piece % 3 === 0
                ? "#818cf8"
                : piece % 3 === 1
                  ? "#4ade80"
                  : "#fbbf24",
            animation: `confetti-fall 900ms ease-out ${piece * 35}ms forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
