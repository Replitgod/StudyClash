export type OpponentMood = "idle" | "thinking" | "gloating" | "rattled" | "victorious" | "defeated";

const MOOD_CONFIG: Record<OpponentMood, { emoji: string; ring: string; label: string }> = {
  idle: { emoji: "🤖", ring: "border-white/15 bg-white/5", label: "Waiting" },
  thinking: { emoji: "🧠", ring: "border-orange-300/40 bg-orange-500/10", label: "Thinking..." },
  gloating: { emoji: "😏", ring: "border-rose-300/50 bg-rose-500/15", label: "Feeling good" },
  rattled: { emoji: "😵", ring: "border-cyan-300/40 bg-cyan-500/10", label: "Shaken" },
  victorious: { emoji: "😈", ring: "border-rose-400/60 bg-rose-500/20", label: "Opponent winning" },
  defeated: { emoji: "😭", ring: "border-emerald-300/50 bg-emerald-500/15", label: "Opponent defeated" },
};

export function OpponentFace({ mood, className = "h-12 w-12 text-2xl" }: { mood: OpponentMood; className?: string }) {
  const { emoji, ring, label } = MOOD_CONFIG[mood];

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-2xl border transition-all duration-300 ${ring} ${
        mood === "thinking" ? "animate-pulse" : ""
      } ${className}`}
      title={label}
      aria-hidden="true"
    >
      {emoji}
    </div>
  );
}

// Maps a win/answer streak onto the same mood vocabulary, so an opponent
// escalates from a normal idle bot into a "furious elite" state as its
// streak climbs, without needing separate thinking/reveal state.
export function moodFromStreak(streak: number): OpponentMood {
  if (streak >= 5) return "victorious";
  if (streak >= 3) return "gloating";
  if (streak <= -2) return "defeated";
  if (streak < 0) return "rattled";
  return "idle";
}
