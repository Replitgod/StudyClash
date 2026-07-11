"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Difficulty = "easy" | "medium" | "hard";

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
  { label: string; minMs: number; maxMs: number; accuracy: number }
> = {
  easy: { label: "Easy", minMs: 3200, maxMs: 6500, accuracy: 0.56 },
  medium: { label: "Medium", minMs: 2200, maxMs: 5200, accuracy: 0.74 },
  hard: { label: "Hard", minMs: 1400, maxMs: 3600, accuracy: 0.88 },
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

export default function InstantAIBattle() {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<BattleRound>({
    playerChoice: null,
    aiChoice: null,
    aiResponseMs: null,
  });
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [waitingForAi, setWaitingForAi] = useState(false);

  const aiTimerRef = useRef<number | null>(null);

  const questionList = useMemo(
    () => questionIds.map((id) => QUESTIONS.find((q) => q.id === id)).filter(Boolean) as Question[],
    [questionIds]
  );

  const currentQuestion = questionList[index] || null;
  const totalRounds = questionList.length;
  const battleStarted = Boolean(difficulty && questionList.length > 0);
  const battleFinished = battleStarted && index >= totalRounds;

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
      }
    };
  }, []);

  const startBattle = (level: Difficulty) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
    }

    setDifficulty(level);
    setQuestionIds(shuffle(QUESTIONS).slice(0, 5).map((q) => q.id));
    setIndex(0);
    setRound({ playerChoice: null, aiChoice: null, aiResponseMs: null });
    setPlayerScore(0);
    setAiScore(0);
    setWaitingForAi(false);
  };

  const handlePickChoice = (choice: string) => {
    if (!difficulty || !currentQuestion || round.playerChoice || waitingForAi || battleFinished) {
      return;
    }

    const cfg = DIFFICULTY_CONFIG[difficulty];
    const responseMs = Math.floor(Math.random() * (cfg.maxMs - cfg.minMs + 1)) + cfg.minMs;

    const playerCorrect = choice === currentQuestion.correct;
    if (playerCorrect) {
      setPlayerScore((prev) => prev + 1);
    }

    setRound({ playerChoice: choice, aiChoice: null, aiResponseMs: null });
    setWaitingForAi(true);

    aiTimerRef.current = window.setTimeout(() => {
      const aiCorrect = Math.random() < cfg.accuracy;
      const aiChoice = aiCorrect ? currentQuestion.correct : pickWrongChoice(currentQuestion);

      if (aiChoice === currentQuestion.correct) {
        setAiScore((prev) => prev + 1);
      }

      setRound({
        playerChoice: choice,
        aiChoice,
        aiResponseMs: responseMs,
      });
      setWaitingForAi(false);
    }, responseMs);
  };

  const nextRound = () => {
    if (!battleStarted || waitingForAi) return;

    if (index >= totalRounds - 1) {
      setIndex(totalRounds);
      return;
    }

    setIndex((prev) => prev + 1);
    setRound({ playerChoice: null, aiChoice: null, aiResponseMs: null });
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

  return (
    <section id="battle-ai" className="w-full rounded-3xl border border-cyan-300/20 bg-[#051320]/90 p-4 shadow-[0_30px_80px_-50px_rgba(6,182,212,0.7)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Instant Mode</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Battle an AI</h2>
          <p className="mt-1 text-sm text-cyan-100/80">Pick a level. One click. Start immediately.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((level) => (
            <button
              key={level}
              onClick={() => startBattle(level)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-transform duration-200 active:scale-95 ${
                difficulty === level
                  ? "bg-cyan-400 text-[#032236]"
                  : "border border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
              }`}
            >
              {DIFFICULTY_CONFIG[level].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#020916] p-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Mode</p>
          <p className="mt-1 text-base font-extrabold text-white">{difficulty ? DIFFICULTY_CONFIG[difficulty].label : "Not started"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">You</p>
          <p className="mt-1 text-base font-extrabold text-emerald-300">{playerScore}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">AI</p>
          <p className="mt-1 text-base font-extrabold text-orange-300">{aiScore}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Round</p>
          <p className="mt-1 text-base font-extrabold text-white">{battleStarted ? `${Math.min(index + 1, totalRounds)}/${totalRounds}` : "0/5"}</p>
        </div>
      </div>

      {!battleStarted && (
        <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-5 text-center text-cyan-100">
          Tap Easy, Medium, or Hard to launch an instant AI duel.
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
                  <span className="h-2 w-2 animate-pulse rounded-full bg-orange-300" />
                  AI is thinking...
                </span>
              ) : round.aiChoice ? (
                <span>
                  AI answered in <strong>{((round.aiResponseMs || 0) / 1000).toFixed(1)}s</strong>
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
        <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-5 text-center">
          <p className="text-lg font-black text-emerald-200">{winnerText}</p>
          <p className="mt-1 text-sm text-emerald-100/90">Final score {playerScore} - {aiScore}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((level) => (
              <button
                key={`rematch-${level}`}
                onClick={() => startBattle(level)}
                className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100"
              >
                Rematch {DIFFICULTY_CONFIG[level].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
