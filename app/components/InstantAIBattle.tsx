"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConfettiBurst from "./ConfettiBurst";
import { OpponentFace, type OpponentMood } from "./OpponentFace";

type Difficulty = "easy" | "medium" | "hard" | "adaptive";

type Question = {
  id: string;
  prompt: string;
  choices: string[];
  correct: string;
};

type BattleRound = {
  playerChoice: string | null;
  aiChoice: string | null;
  aiResponseMs: number | null;
  playerResponseMs: number | null;
};

type RoundStats = {
  playerCorrect: boolean;
  aiCorrect: boolean;
  playerResponseMs: number;
  aiResponseMs: number;
};

const QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "Which statement best describes mitosis?",
    choices: [
      "Creates two identical daughter cells",
      "Creates four unique gametes",
      "Only occurs in plant roots",
      "Happens during photosynthesis",
    ],
    correct: "Creates two identical daughter cells",
  },
  {
    id: "q2",
    prompt: "In algebra, what is the solution to 2x + 6 = 18?",
    choices: ["x = 3", "x = 6", "x = 9", "x = 12"],
    correct: "x = 6",
  },
  {
    id: "q3",
    prompt: "Which organelle is known as the cell's powerhouse?",
    choices: ["Ribosome", "Mitochondrion", "Golgi apparatus", "Nucleus"],
    correct: "Mitochondrion",
  },
  {
    id: "q4",
    prompt: "What is the primary purpose of a thesis statement?",
    choices: [
      "List all sources",
      "State the central argument",
      "Summarize every paragraph",
      "Give a final conclusion",
    ],
    correct: "State the central argument",
  },
  {
    id: "q5",
    prompt: "If demand rises and supply stays constant, price usually:",
    choices: ["Falls", "Stays fixed", "Rises", "Becomes zero"],
    correct: "Rises",
  },
  {
    id: "q6",
    prompt: "Which SAT strategy is most effective for time pressure?",
    choices: [
      "Read every option twice",
      "Skip all hard questions",
      "Mark and return to blockers",
      "Never guess",
    ],
    correct: "Mark and return to blockers",
  },
  {
    id: "q7",
    prompt: "What does DNA stand for?",
    choices: [
      "Deoxyribonucleic acid",
      "Dynamic nitrogen array",
      "Digital neural axis",
      "Dual nucleus assembly",
    ],
    correct: "Deoxyribonucleic acid",
  },
  {
    id: "q8",
    prompt: "Which graph shows a linear function?",
    choices: [
      "A straight line",
      "A U-shaped parabola",
      "A circle",
      "An exponential curve",
    ],
    correct: "A straight line",
  },
];

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; minMs: number; maxMs: number; accuracy: number; summary: string }
> = {
  easy: {
    label: "Easy",
    minMs: 3200,
    maxMs: 6500,
    accuracy: 0.56,
    summary: "Friendly warm-up speed and accuracy",
  },
  medium: {
    label: "Medium",
    minMs: 2200,
    maxMs: 5200,
    accuracy: 0.74,
    summary: "Balanced pressure and challenge",
  },
  hard: {
    label: "Hard",
    minMs: 1400,
    maxMs: 3600,
    accuracy: 0.88,
    summary: "Fast, aggressive, high-accuracy AI",
  },
  adaptive: {
    label: "Adaptive AI (Recommended)",
    minMs: 1700,
    maxMs: 4800,
    accuracy: 0.78,
    summary: "Learns your pace and adjusts in real time",
  },
};

function shuffle<T>(items: T[]): T[] {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = clone[i];
    clone[i] = clone[j];
    clone[j] = tmp;
  }
  return clone;
}

function pickWrongChoice(question: Question): string {
  const wrong = question.choices.filter((choice) => choice !== question.correct);
  return wrong[Math.floor(Math.random() * wrong.length)] || question.choices[0];
}

// Lightweight synthesized SFX (no audio assets needed) — chirps for correct/
// wrong/win/lose, all triggered from a user gesture (button click) so no
// autoplay-policy issues.
function playTone(notes: Array<{ freq: number; startMs: number; durationMs: number; type?: OscillatorType }>) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    notes.forEach(({ freq, startMs, durationMs, type = "sine" }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = ctx.currentTime + startMs / 1000;
      const end = start + durationMs / 1000;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.start(start);
      osc.stop(end + 0.02);
    });

    window.setTimeout(() => ctx.close(), 1200);
  } catch {
    // Web Audio unsupported or blocked — sound is a nice-to-have, fail silent.
  }
}

const SFX = {
  playerCorrect: () => playTone([{ freq: 720, startMs: 0, durationMs: 90 }, { freq: 980, startMs: 90, durationMs: 120 }]),
  playerWrong: () => playTone([{ freq: 220, startMs: 0, durationMs: 180, type: "sawtooth" }]),
  win: () =>
    playTone([
      { freq: 523, startMs: 0, durationMs: 110 },
      { freq: 659, startMs: 110, durationMs: 110 },
      { freq: 784, startMs: 220, durationMs: 220 },
    ]),
  lose: () =>
    playTone([
      { freq: 392, startMs: 0, durationMs: 140, type: "triangle" },
      { freq: 293, startMs: 140, durationMs: 260, type: "triangle" },
    ]),
};

export default function InstantAIBattle() {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<BattleRound>({
    playerChoice: null,
    aiChoice: null,
    aiResponseMs: null,
    playerResponseMs: null,
  });
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [roundStats, setRoundStats] = useState<RoundStats[]>([]);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [shake, setShake] = useState(false);
  const [lastAiCorrect, setLastAiCorrect] = useState<boolean | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const aiTimerRef = useRef<number | null>(null);
  const roundStartMsRef = useRef<number>(0);
  const shakeTimerRef = useRef<number | null>(null);

  const questionList = useMemo(
    () => questionIds.map((id) => QUESTIONS.find((q) => q.id === id)).filter(Boolean) as Question[],
    [questionIds]
  );

  const currentQuestion = questionList[index] || null;
  const totalRounds = questionList.length;
  const battleStarted = Boolean(difficulty && questionList.length > 0);
  const battleFinished = battleStarted && index >= totalRounds;

  const avgPlayerMs =
    roundStats.length > 0
      ? Math.round(
          roundStats.reduce((sum, entry) => sum + entry.playerResponseMs, 0) /
            roundStats.length
        )
      : null;

  const avgAiMs =
    roundStats.length > 0
      ? Math.round(
          roundStats.reduce((sum, entry) => sum + entry.aiResponseMs, 0) /
            roundStats.length
        )
      : null;

  const aiAccuracy =
    roundStats.length > 0
      ? Math.round(
          (roundStats.filter((entry) => entry.aiCorrect).length /
            roundStats.length) *
            100
        )
      : null;

  const playerAccuracy =
    roundStats.length > 0
      ? Math.round(
          (roundStats.filter((entry) => entry.playerCorrect).length /
            roundStats.length) *
            100
        )
      : null;

  const adaptivePressure = useMemo(() => {
    if (difficulty !== "adaptive") return "Standard";
    if (roundStats.length < 2) return "Calibrating";

    const recent = roundStats.slice(-2);
    const playerRecentAccuracy =
      recent.filter((item) => item.playerCorrect).length / recent.length;
    const playerRecentSpeedMs =
      recent.reduce((sum, item) => sum + item.playerResponseMs, 0) / recent.length;

    if (playerRecentAccuracy >= 1 && playerRecentSpeedMs < 3200) {
      return "Pushing Hard";
    }

    if (playerRecentAccuracy <= 0.5 || playerRecentSpeedMs > 6000) {
      return "Supportive";
    }

    return "Balanced";
  }, [difficulty, roundStats]);

  const aiMood: OpponentMood = useMemo(() => {
    if (battleFinished) return aiScore >= playerScore ? "victorious" : "defeated";
    if (waitingForAi) return "thinking";
    if (lastAiCorrect === true) return "gloating";
    if (lastAiCorrect === false) return "rattled";
    return "idle";
  }, [battleFinished, waitingForAi, lastAiCorrect, aiScore, playerScore]);

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
      }
      if (shakeTimerRef.current) {
        window.clearTimeout(shakeTimerRef.current);
      }
    };
  }, []);

  const triggerShake = () => {
    setShake(true);
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShake(false), 420);
  };

  const startBattle = (level: Difficulty) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
    }

    setDifficulty(level);
    setQuestionIds(shuffle(QUESTIONS).slice(0, 5).map((q) => q.id));
    setIndex(0);
    setRound({ playerChoice: null, aiChoice: null, aiResponseMs: null, playerResponseMs: null });
    setPlayerScore(0);
    setAiScore(0);
    setRoundStats([]);
    setWaitingForAi(false);
    setLastAiCorrect(null);
    setShowDifficultyPicker(false);
    roundStartMsRef.current = Date.now();
  };

  const handlePickChoice = (choice: string) => {
    if (!difficulty || !currentQuestion || round.playerChoice || waitingForAi || battleFinished) {
      return;
    }

    const cfg = DIFFICULTY_CONFIG[difficulty];
    const playerResponseMs = Math.max(500, Date.now() - roundStartMsRef.current);

    const adaptiveOffset =
      difficulty === "adaptive"
        ? Math.max(-700, Math.min(700, Math.floor((4500 - playerResponseMs) / 5)))
        : 0;

    const responseMs =
      Math.floor(Math.random() * (cfg.maxMs - cfg.minMs + 1)) +
      cfg.minMs +
      adaptiveOffset;

    const clampedResponseMs = Math.max(1200, Math.min(7200, responseMs));

    const playerCorrect = choice === currentQuestion.correct;
    if (playerCorrect) {
      setPlayerScore((prev) => prev + 1);
    }
    if (soundOn) {
      if (playerCorrect) {
        SFX.playerCorrect();
      } else {
        SFX.playerWrong();
      }
    }

    setRound({
      playerChoice: choice,
      aiChoice: null,
      aiResponseMs: null,
      playerResponseMs,
    });
    setWaitingForAi(true);

    aiTimerRef.current = window.setTimeout(() => {
      const adaptiveAccuracyBoost =
        difficulty === "adaptive"
          ? playerCorrect
            ? 0.07
            : -0.08
          : 0;
      const aiCorrect = Math.random() < Math.max(0.35, Math.min(0.95, cfg.accuracy + adaptiveAccuracyBoost));
      const aiChoice = aiCorrect ? currentQuestion.correct : pickWrongChoice(currentQuestion);

      if (aiChoice === currentQuestion.correct) {
        setAiScore((prev) => prev + 1);
      }

      setRound({
        playerChoice: choice,
        aiChoice,
        aiResponseMs: clampedResponseMs,
        playerResponseMs,
      });
      setLastAiCorrect(aiCorrect);
      triggerShake();

      setRoundStats((prev) => [
        ...prev,
        {
          playerCorrect,
          aiCorrect,
          playerResponseMs,
          aiResponseMs: clampedResponseMs,
        },
      ]);

      setWaitingForAi(false);
    }, clampedResponseMs);
  };

  const nextRound = () => {
    if (!battleStarted || waitingForAi) return;

    if (index >= totalRounds - 1) {
      const finalPlayerScore = playerScore;
      const finalAiScore = aiScore;
      if (soundOn) {
        if (finalPlayerScore >= finalAiScore) {
          SFX.win();
        } else {
          SFX.lose();
        }
      }
      setIndex(totalRounds);
      return;
    }

    setIndex((prev) => prev + 1);
    setRound({ playerChoice: null, aiChoice: null, aiResponseMs: null, playerResponseMs: null });
    setLastAiCorrect(null);
    roundStartMsRef.current = Date.now();
  };

  const getRoundPillClass = (choice: string) => {
    if (!currentQuestion) return "border-white/15 bg-white/5";
    if (choice === currentQuestion.correct) {
      return "border-emerald-400/40 bg-emerald-500/15";
    }
    return "border-white/15 bg-white/5";
  };

  const winnerText =
    playerScore === aiScore
      ? "Draw. One-click rematch?"
      : playerScore > aiScore
        ? "You win this duel."
        : "AI wins this duel.";

  const playerWon = playerScore >= aiScore;

  return (
    <section
      id="battle-ai"
      className={`w-full rounded-3xl border border-cyan-300/25 bg-[#061325]/95 p-4 shadow-[0_40px_90px_-55px_rgba(6,182,212,0.85)] sm:p-6 ${
        shake ? "animate-[battle-shake_420ms_ease-in-out]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Instant Mode</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Battle an AI in One Click</h2>
          <p className="mt-1 text-sm text-cyan-100/80">No lobby. Tap start and answer 5 quick questions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100/90">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1">No Signup Needed</span>
          <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1">~60 Seconds</span>
          <button
            type="button"
            onClick={() => setSoundOn((prev) => !prev)}
            className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 normal-case tracking-normal"
            aria-pressed={soundOn}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {!battleStarted && (
        <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <OpponentFace mood="idle" />
              <div>
                <p className="text-sm font-bold text-cyan-100">Ready when you are</p>
                <p className="text-xs text-cyan-100/80">Quick Play auto-balances to your pace.</p>
              </div>
            </div>
            <button
              onClick={() => startBattle("adaptive")}
              className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-black text-[#032236] transition-transform duration-200 active:scale-95"
            >
              Battle Now
            </button>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowDifficultyPicker((prev) => !prev)}
              className="text-xs font-semibold text-cyan-200/80 underline-offset-2 hover:text-cyan-100 hover:underline"
            >
              {showDifficultyPicker ? "Hide difficulty options" : "Choose difficulty instead"}
            </button>
          </div>

          {showDifficultyPicker && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((level) => (
                <button
                  key={level}
                  onClick={() => startBattle(level)}
                  className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-100 transition-transform duration-200 hover:bg-cyan-500/20 active:scale-95"
                  title={DIFFICULTY_CONFIG[level].summary}
                >
                  {DIFFICULTY_CONFIG[level].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#020916] p-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Mode</p>
          <p className="mt-1 text-base font-extrabold text-white">{difficulty ? DIFFICULTY_CONFIG[difficulty].label : "Not started"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">You</p>
          <p className="mt-1 text-base font-extrabold text-emerald-300">{playerScore}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-white/60">AI</p>
              <p className="mt-1 text-base font-extrabold text-orange-300">{aiScore}</p>
            </div>
            {battleStarted && <OpponentFace mood={aiMood} />}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Round</p>
          <p className="mt-1 text-base font-extrabold text-white">{battleStarted ? `${Math.min(index + 1, totalRounds)}/${totalRounds}` : "0/5"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Your Accuracy</p>
          <p className="mt-1 text-base font-extrabold text-emerald-200">{playerAccuracy == null ? "-" : `${playerAccuracy}%`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">AI Accuracy</p>
          <p className="mt-1 text-base font-extrabold text-orange-200">{aiAccuracy == null ? "-" : `${aiAccuracy}%`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Your Avg Time</p>
          <p className="mt-1 text-base font-extrabold text-cyan-100">{avgPlayerMs == null ? "-" : `${(avgPlayerMs / 1000).toFixed(1)}s`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">AI Avg Time</p>
          <p className="mt-1 text-base font-extrabold text-cyan-100">{avgAiMs == null ? "-" : `${(avgAiMs / 1000).toFixed(1)}s`}</p>
        </div>
      </div>

      {difficulty === "adaptive" && battleStarted && (
        <div className="mt-3 rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/10 px-4 py-2 text-xs text-fuchsia-100">
          Adaptive pressure: <strong>{adaptivePressure}</strong>
        </div>
      )}

      {!battleStarted && (
        <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-5 text-center text-cyan-100">
          Tap Battle Now to launch an instant duel.
        </div>
      )}

      {battleStarted && !battleFinished && currentQuestion && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#06101f] p-4 sm:p-5">
          <p className="text-sm font-bold text-cyan-200">{currentQuestion.prompt}</p>

          <div className="mt-4 grid gap-2">
            {currentQuestion.choices.map((choice) => {
              const isLocked = Boolean(round.playerChoice);
              const isSelected = round.playerChoice === choice;

              return (
                <button
                  key={choice}
                  onClick={() => handlePickChoice(choice)}
                  disabled={isLocked}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    isSelected ? getRoundPillClass(choice) : "border-white/15 bg-white/5 hover:bg-white/10"
                  } ${isLocked ? "cursor-default" : "active:scale-[0.99]"}`}
                >
                  {choice}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/80">
              {waitingForAi ? (
                <span className="inline-flex items-center gap-2 text-orange-200">
                  <OpponentFace mood="thinking" />
                  AI is thinking...
                </span>
              ) : round.aiChoice ? (
                <span className="inline-flex flex-wrap items-center gap-3">
                  <OpponentFace mood={aiMood} />
                  <span>
                    AI: <strong>{((round.aiResponseMs || 0) / 1000).toFixed(1)}s</strong>
                  </span>
                  <span>
                    You: <strong>{((round.playerResponseMs || 0) / 1000).toFixed(1)}s</strong>
                  </span>
                </span>
              ) : (
                "Select an answer to begin."
              )}
            </div>

            <button
              onClick={nextRound}
              disabled={!round.aiChoice || waitingForAi}
              className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-[#051320] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {index >= totalRounds - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      )}

      {battleFinished && (
        <div className="relative mt-5 overflow-hidden rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-5 text-center">
          <ConfettiBurst show={playerWon} />
          <div className="flex items-center justify-center gap-3">
            <OpponentFace mood={aiMood} />
            <p className="text-lg font-black text-emerald-200">{winnerText}</p>
          </div>
          <p className="mt-1 text-sm text-emerald-100/90">Final score {playerScore} - {aiScore}</p>
          <p className="mt-1 text-xs text-emerald-100/75">
            AI realism stats: {aiAccuracy == null ? "-" : `${aiAccuracy}% accuracy`} · {avgAiMs == null ? "-" : `${(avgAiMs / 1000).toFixed(1)}s avg response`}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => startBattle(difficulty || "adaptive")}
              className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-black text-[#052914] transition-transform duration-200 active:scale-95"
            >
              Rematch
            </button>
            {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[])
              .filter((level) => level !== difficulty)
              .map((level) => (
                <button
                  key={`rematch-${level}`}
                  onClick={() => startBattle(level)}
                  className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100"
                >
                  Try {DIFFICULTY_CONFIG[level].label}
                </button>
              ))}
          </div>

          <div className="mt-5 rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 p-4">
            <p className="text-sm font-bold text-fuchsia-100">Beat the AI? Prove it.</p>
            <p className="mt-1 text-xs text-fuchsia-100/80">Create an account to challenge a friend to beat your score.</p>
            <Link
              href={`/signup?redirect=${encodeURIComponent("/create")}`}
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-400 to-violet-400 px-5 py-2.5 text-sm font-black text-[#1a0524] transition-transform duration-200 active:scale-95"
            >
              Challenge a Friend
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
