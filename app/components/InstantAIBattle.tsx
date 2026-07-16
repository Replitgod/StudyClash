"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConfettiBurst from "./ConfettiBurst";
import { OpponentFace, type OpponentMood } from "./OpponentFace";
import { playTone } from "@/lib/uiSound";
import { difficultyToBeta, probabilityCorrect, updateAbility } from "@/lib/irt";
import { copyTextToClipboard } from "@/lib/clipboard";
import { trackEvent } from "@/lib/trackEvent";

type Difficulty = "easy" | "medium" | "hard" | "adaptive";

// Named `itemDifficulty` (not `difficulty`) to avoid reading like the
// battle-mode `difficulty` state below -- this is the IRT item parameter
// (beta, via difficultyToBeta) for one specific question, unrelated to
// which Difficulty mode the player picked for the whole battle.
type Question = {
  id: string;
  prompt: string;
  choices: string[];
  correct: string;
  explanation?: string;
  topic?: string;
  itemDifficulty?: string;
};

type StudyResource = {
  title: string;
  source: string;
  url: string;
  whyChosen: string;
  trustTier: "official" | "reputable" | "community";
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
  // IRT-predicted P(correct) for this question, computed from the
  // player's ability estimate *before* this round's outcome was known --
  // this is the "moving probability" the model predicted, not a
  // retrospective fit.
  predictedProbability: number;
};

// Offline safety net only -- the live battle always tries AI-generated
// questions first (see startBattle) so the set is different and harder
// every time. This pool is what renders if that request fails.
const FALLBACK_QUESTIONS: Question[] = [
  {
    id: "fallback-q1",
    prompt: "A cell with 46 chromosomes undergoes meiosis. How many chromosomes will each resulting gamete contain?",
    choices: ["11.5", "23", "46", "92"],
    correct: "23",
    explanation: "Meiosis halves the chromosome number so that fertilization restores the full 46, unlike mitosis which preserves it.",
    topic: "Meiosis",
  },
  {
    id: "fallback-q2",
    prompt: "If 3(2x - 4) = 5x + 2, what is the value of x?",
    choices: ["10", "12", "14", "16"],
    correct: "14",
    explanation: "Distribute to get 6x - 12 = 5x + 2, then x = 14.",
    topic: "Linear equations",
  },
  {
    id: "fallback-q3",
    prompt: "Mitochondria are called the cell's powerhouse because they carry out which process to generate ATP?",
    choices: ["Photosynthesis", "Cellular respiration", "Protein synthesis", "DNA replication"],
    correct: "Cellular respiration",
    explanation: "Mitochondria break down glucose via cellular respiration; photosynthesis happens in chloroplasts, not mitochondria.",
    topic: "Cellular respiration",
  },
  {
    id: "fallback-q4",
    prompt: "A thesis reads: \"Social media has both positive and negative effects on teenagers.\" Which revision most strengthens it?",
    choices: [
      "Add more transition words between paragraphs",
      "Sharpen it into one specific, arguable claim",
      "Insert a quote from a news article",
      "Shorten it to a single short sentence",
    ],
    correct: "Sharpen it into one specific, arguable claim",
    explanation: "A strong thesis takes a specific, defensible position -- listing both sides isn't an argument yet.",
    topic: "Thesis statements",
  },
  {
    id: "fallback-q5",
    prompt: "A government sets a price ceiling below the market equilibrium price for an essential good. What is the most likely result?",
    choices: ["A shortage", "A surplus", "No change in quantity", "The price rises further"],
    correct: "A shortage",
    explanation: "A ceiling below equilibrium keeps price artificially low, so quantity demanded exceeds quantity supplied -- a shortage.",
    topic: "Price controls",
  },
  {
    id: "fallback-q6",
    prompt: "With 10 minutes left and 6 unanswered multiple-choice questions with no penalty for guessing, what is the best strategy?",
    choices: [
      "Leave them blank to avoid risk",
      "Only answer the ones you're fully sure of",
      "Guess on every remaining question",
      "Skip all of them and review earlier answers instead",
    ],
    correct: "Guess on every remaining question",
    explanation: "With no penalty for wrong answers, a guess has strictly positive expected value over leaving it blank.",
    topic: "Test-taking strategy",
  },
  {
    id: "fallback-q7",
    prompt: "In a cross between two heterozygous (Aa) pea plants, what fraction of offspring are expected to show the recessive phenotype?",
    choices: ["0", "1/4", "1/2", "3/4"],
    correct: "1/4",
    explanation: "A Punnett square for Aa x Aa gives 1 AA : 2 Aa : 1 aa, so 1/4 show the recessive (aa) phenotype.",
    topic: "Mendelian genetics",
  },
  {
    id: "fallback-q8",
    prompt: "Which best describes the graph of y = -2x^2 + 3?",
    choices: [
      "A downward-opening parabola with vertex (0, 3)",
      "An upward-opening parabola with vertex (0, -3)",
      "A straight line with slope -2",
      "A downward-opening parabola with vertex (3, 0)",
    ],
    correct: "A downward-opening parabola with vertex (0, 3)",
    explanation: "A negative leading coefficient opens the parabola downward, and the constant term 3 gives the vertex y-value when x = 0.",
    topic: "Quadratic functions",
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

// Battle-specific tone presets built on the shared playTone engine
// (lib/uiSound.ts) -- kept local since these are specific to battle
// outcomes, not generic UI moments.
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
  const [battleQuestions, setBattleQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
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
  // IRT ability estimate (theta), logit scale, reset to 0 (average) at the
  // start of each battle -- see lib/irt.ts. Drives the Adaptive AI's
  // accuracy target in handlePickChoice below.
  const [playerTheta, setPlayerTheta] = useState(0);
  const [resultCopied, setResultCopied] = useState(false);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [shake, setShake] = useState(false);
  const [lastAiCorrect, setLastAiCorrect] = useState<boolean | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [wrongAnswerResource, setWrongAnswerResource] = useState<StudyResource | null>(null);
  const [isLoadingResource, setIsLoadingResource] = useState(false);
  const [resourceDisclaimer, setResourceDisclaimer] = useState<string | null>(null);

  const aiTimerRef = useRef<number | null>(null);
  const roundStartMsRef = useRef<number>(0);
  const shakeTimerRef = useRef<number | null>(null);
  const resourceRequestIdRef = useRef(0);

  const currentQuestion = battleQuestions[index] || null;
  const totalRounds = battleQuestions.length;
  const battleStarted = Boolean(difficulty && battleQuestions.length > 0);
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

  // Derived directly from playerTheta (the same IRT ability estimate that
  // drives the AI's actual accuracy target in handlePickChoice) so this
  // label and the numbers shown alongside it always tell the same story,
  // rather than being two independently-tuned "adaptive" signals that
  // could disagree with each other.
  const adaptivePressure = useMemo(() => {
    if (difficulty !== "adaptive") return "Standard";
    if (roundStats.length < 2) return "Calibrating";
    if (playerTheta >= 0.6) return "Pushing Hard";
    if (playerTheta <= -0.6) return "Supportive";
    return "Balanced";
  }, [difficulty, roundStats.length, playerTheta]);

  const nextItemPredictedProbability = useMemo(() => {
    if (!currentQuestion) return null;
    return probabilityCorrect(playerTheta, difficultyToBeta(currentQuestion.itemDifficulty || "medium"));
  }, [currentQuestion, playerTheta]);

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

  const startBattle = async (level: Difficulty) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
    }

    setIsLoadingQuestions(true);
    setShowDifficultyPicker(false);
    const avoidQuestionTexts = battleQuestions.map((question) => question.prompt);
    let nextQuestions: Question[];

    try {
      const response = await fetch("/api/demo/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avoidQuestionTexts, count: 5, subject: "general_academic" }),
      });

      if (!response.ok) throw new Error("Battle question generation failed");
      const data = await response.json();

      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("Battle question generation returned no questions");
      }

      nextQuestions = (
        data.questions as Array<{
          question_text: string;
          answer_choices: string[];
          correct_answer: string;
          explanation: string;
          topic: string;
          difficulty?: string;
        }>
      ).map((question, questionIndex) => ({
        id: `ai-battle-q${questionIndex}`,
        prompt: question.question_text,
        choices: question.answer_choices,
        correct: question.correct_answer,
        explanation: question.explanation,
        topic: question.topic,
        itemDifficulty: question.difficulty,
      }));
    } catch {
      nextQuestions = shuffle(FALLBACK_QUESTIONS).slice(0, 5);
    }

    setIsLoadingQuestions(false);
    setDifficulty(level);
    setBattleQuestions(nextQuestions);
    setPlayerTheta(0);
    setIndex(0);
    setRound({ playerChoice: null, aiChoice: null, aiResponseMs: null, playerResponseMs: null });
    setPlayerScore(0);
    setAiScore(0);
    setRoundStats([]);
    setWaitingForAi(false);
    setLastAiCorrect(null);
    setWrongAnswerResource(null);
    setResourceDisclaimer(null);
    setIsLoadingResource(false);
    roundStartMsRef.current = Date.now();
  };

  const fetchStudyResourceForMiss = (question: Question) => {
    const requestId = ++resourceRequestIdRef.current;
    setWrongAnswerResource(null);
    setResourceDisclaimer(null);
    setIsLoadingResource(true);

    fetch("/api/find-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: question.topic || question.prompt.slice(0, 120) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (resourceRequestIdRef.current !== requestId) return;
        const resources: StudyResource[] = Array.isArray(data?.resources) ? data.resources : [];
        setWrongAnswerResource(resources[0] || null);
        if (resources.length === 0) {
          setResourceDisclaimer(data?.disclaimer || "No study link found for this topic right now.");
        }
      })
      .catch(() => {
        if (resourceRequestIdRef.current !== requestId) return;
        setResourceDisclaimer("Couldn't reach a study source right now.");
      })
      .finally(() => {
        if (resourceRequestIdRef.current === requestId) setIsLoadingResource(false);
      });
  };

  const handlePickChoice = (choice: string) => {
    if (!difficulty || !currentQuestion || round.playerChoice || waitingForAi || battleFinished) {
      return;
    }

    const cfg = DIFFICULTY_CONFIG[difficulty];
    const playerResponseMs = Math.max(500, Date.now() - roundStartMsRef.current);

    // IRT: predicted P(correct) for THIS question, from the player's
    // ability estimate going into this round (built from every prior
    // round's outcome, not this one) -- computed before we know whether
    // they get it right, which is what makes it a genuine prediction
    // rather than a number fitted after the fact.
    const itemBeta = difficultyToBeta(currentQuestion.itemDifficulty || "medium");
    const predictedProbability = probabilityCorrect(playerTheta, itemBeta);

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
    } else {
      fetchStudyResourceForMiss(currentQuestion);
    }
    if (soundOn) {
      if (playerCorrect) {
        SFX.playerCorrect();
      } else {
        SFX.playerWrong();
      }
    }

    // The player's outcome is already known the instant they pick an
    // answer, so the ability update happens now rather than being deferred
    // to the AI's simulated "thinking" delay below.
    setPlayerTheta((prevTheta) => updateAbility(prevTheta, itemBeta, playerCorrect));

    setRound({
      playerChoice: choice,
      aiChoice: null,
      aiResponseMs: null,
      playerResponseMs,
    });
    setWaitingForAi(true);

    aiTimerRef.current = window.setTimeout(() => {
      // Adaptive mode: the AI's accuracy this round is anchored directly to
      // the model's prediction of how the player would do on this same
      // question, instead of a flat difficulty-config accuracy nudged by a
      // hand-tuned +-0.07/0.08 constant -- a student the model rates as
      // likely to succeed faces a sharper opponent; one it rates as
      // struggling gets more breathing room.
      const aiTargetAccuracy = difficulty === "adaptive" ? predictedProbability : cfg.accuracy;
      const aiCorrect = Math.random() < Math.max(0.35, Math.min(0.95, aiTargetAccuracy));
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
          predictedProbability,
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
    setWrongAnswerResource(null);
    setResourceDisclaimer(null);
    setIsLoadingResource(false);
    resourceRequestIdRef.current += 1;
    roundStartMsRef.current = Date.now();
  };

  // No account/backend record needed to share -- this is a plain result
  // message pointing back to the homepage widget, not a personalized
  // /challenge/[token] comparison link (that needs a real signed-in
  // user's persisted match, which an anonymous Instant Battle never
  // creates). Matches the same "don't gate sharing behind signup"
  // principle the real battle results page and demo already use.
  const handleCopyResult = async () => {
    const shareMessage = `I scored ${playerScore}-${aiScore} against the AI on StudyClash${playerAccuracy != null ? ` (${playerAccuracy}% accuracy)` : ""}. Beat me: ${window.location.origin}/#battle-ai`;
    const copied = await copyTextToClipboard(shareMessage);

    if (copied) {
      setResultCopied(true);
      void trackEvent("challenge_link_copied", { source: "instant_battle", playerScore, aiScore });
      setTimeout(() => setResultCopied(false), 2000);
      return;
    }

    void trackEvent("challenge_link_copy_failed", { source: "instant_battle" });
  };

  // Reveals the correct answer once the round is locked in, not just
  // whichever choice happens to have been picked -- a student who answers
  // wrong should see what the right answer was, the same as the real
  // battle page and the standalone demo already do.
  const getRoundPillClass = (choice: string, isLocked: boolean, isSelected: boolean) => {
    if (!currentQuestion || !isLocked) return "border-white/15 bg-white/5 hover:bg-white/10";
    if (choice === currentQuestion.correct) {
      return "border-green-400/40 bg-green-500/15";
    }
    if (isSelected) {
      return "border-red-400/40 bg-red-500/15";
    }
    return "border-white/10 bg-white/5 opacity-50";
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
      className={`w-full rounded-3xl border border-indigo-300/25 bg-[#061325]/95 p-4 shadow-[0_40px_90px_-55px_rgba(6,182,212,0.85)] sm:p-6 ${
        shake ? "animate-[battle-shake_420ms_ease-in-out]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Instant Mode</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Battle an AI in One Click</h2>
          <p className="mt-1 text-sm text-indigo-100/80">No lobby. Tap start and answer 5 quick questions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-indigo-100/90">
          <span className="rounded-full border border-indigo-300/30 bg-indigo-500/10 px-3 py-1">No Signup Needed</span>
          <span className="rounded-full border border-indigo-300/30 bg-indigo-500/10 px-3 py-1">~60 Seconds</span>
          <button
            type="button"
            onClick={() => setSoundOn((prev) => !prev)}
            className="rounded-full border border-indigo-300/30 bg-indigo-500/10 px-3 py-1 normal-case tracking-normal"
            aria-pressed={soundOn}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {!battleStarted && (
        <div className="mt-4 rounded-2xl border border-indigo-300/25 bg-indigo-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <OpponentFace mood="idle" />
              <div>
                <p className="text-sm font-bold text-indigo-100">Ready when you are</p>
                <p className="text-xs text-indigo-100/80">Quick Play auto-balances to your pace.</p>
              </div>
            </div>
            <button
              onClick={() => startBattle("adaptive")}
              disabled={isLoadingQuestions}
              className="rounded-xl bg-indigo-300 px-5 py-2.5 text-sm font-black text-[#032236] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingQuestions ? "Preparing questions..." : "Battle Now"}
            </button>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowDifficultyPicker((prev) => !prev)}
              className="text-xs font-semibold text-indigo-200/80 underline-offset-2 hover:text-indigo-100 hover:underline"
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
                  disabled={isLoadingQuestions}
                  className="rounded-xl border border-indigo-300/30 bg-indigo-500/10 px-4 py-2 text-sm font-bold text-indigo-100 transition-transform duration-200 hover:bg-indigo-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
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
          <p className="mt-1 text-base font-extrabold text-green-300">{playerScore}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-white/60">AI</p>
              <p className="mt-1 text-base font-extrabold text-amber-300">{aiScore}</p>
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
          <p className="mt-1 text-base font-extrabold text-green-200">{playerAccuracy == null ? "-" : `${playerAccuracy}%`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">AI Accuracy</p>
          <p className="mt-1 text-base font-extrabold text-amber-200">{aiAccuracy == null ? "-" : `${aiAccuracy}%`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">Your Avg Time</p>
          <p className="mt-1 text-base font-extrabold text-indigo-100">{avgPlayerMs == null ? "-" : `${(avgPlayerMs / 1000).toFixed(1)}s`}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/60">AI Avg Time</p>
          <p className="mt-1 text-base font-extrabold text-indigo-100">{avgAiMs == null ? "-" : `${(avgAiMs / 1000).toFixed(1)}s`}</p>
        </div>
      </div>

      {difficulty === "adaptive" && battleStarted && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-indigo-300/25 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-100">
          <span>
            Adaptive pressure: <strong>{adaptivePressure}</strong>
          </span>
          <span className="text-indigo-100/70">
            Ability (&theta;): <strong>{playerTheta.toFixed(2)}</strong>
          </span>
          {!battleFinished && nextItemPredictedProbability !== null && (
            <span className="text-indigo-100/70">
              P(next correct): <strong>{Math.round(nextItemPredictedProbability * 100)}%</strong>
            </span>
          )}
        </div>
      )}

      {!battleStarted && (
        <div className="mt-5 rounded-2xl border border-indigo-300/20 bg-indigo-500/10 p-5 text-center text-indigo-100">
          Tap Battle Now to launch an instant duel.
        </div>
      )}

      {battleStarted && !battleFinished && currentQuestion && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#06101f] p-4 sm:p-5">
          <p className="text-sm font-bold text-indigo-200">{currentQuestion.prompt}</p>

          <div className="mt-4 grid gap-2">
            {currentQuestion.choices.map((choice) => {
              const isLocked = Boolean(round.playerChoice);
              const isSelected = round.playerChoice === choice;
              const isCorrectChoice = currentQuestion.correct === choice;

              return (
                <button
                  key={choice}
                  onClick={() => handlePickChoice(choice)}
                  disabled={isLocked}
                  aria-pressed={isSelected}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${getRoundPillClass(
                    choice,
                    isLocked,
                    isSelected
                  )} ${isLocked ? "cursor-default" : "active:scale-[0.99]"}`}
                >
                  <span>{choice}</span>
                  {isLocked && isCorrectChoice && (
                    <span className="flex flex-shrink-0 items-center text-green-300">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="sr-only">Correct answer</span>
                    </span>
                  )}
                  {isLocked && !isCorrectChoice && isSelected && (
                    <span className="flex flex-shrink-0 items-center text-red-300">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="sr-only">Your answer, incorrect</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/80">
              {waitingForAi ? (
                <span className="inline-flex items-center gap-2 text-amber-200">
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

          {round.aiChoice && currentQuestion.explanation && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              {currentQuestion.explanation}
            </div>
          )}

          {round.playerChoice && round.playerChoice !== currentQuestion.correct && (
            <div className="mt-3">
              {isLoadingResource && (
                <p className="text-xs text-white/50">Finding a study source for this topic...</p>
              )}

              {wrongAnswerResource && (
                <a
                  href={wrongAnswerResource.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block rounded-xl border border-amber-300/25 bg-amber-500/[0.06] p-3 transition-colors hover:border-amber-300/45 hover:bg-amber-500/[0.1]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white/90">{wrongAnswerResource.title}</p>
                    <span
                      className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        wrongAnswerResource.trustTier === "official"
                          ? "border-green-300/40 bg-green-500/15 text-green-200"
                          : wrongAnswerResource.trustTier === "reputable"
                            ? "border-indigo-300/40 bg-indigo-500/15 text-indigo-200"
                            : "border-white/20 bg-white/5 text-white/60"
                      }`}
                    >
                      {wrongAnswerResource.trustTier}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/50">{wrongAnswerResource.source}</p>
                  <p className="mt-1.5 text-xs text-white/75">{wrongAnswerResource.whyChosen}</p>
                </a>
              )}

              {!isLoadingResource && !wrongAnswerResource && resourceDisclaimer && (
                <p className="text-xs text-white/40">{resourceDisclaimer}</p>
              )}
            </div>
          )}
        </div>
      )}

      {battleFinished && (
        <div className="relative mt-5 overflow-hidden rounded-2xl border border-green-300/30 bg-green-500/10 p-5 text-center">
          <ConfettiBurst show={playerWon} />
          <div className="flex items-center justify-center gap-3">
            <OpponentFace mood={aiMood} />
            <p className="text-lg font-black text-green-200">{winnerText}</p>
          </div>
          <p className="mt-1 text-sm text-green-100/90">Final score {playerScore} - {aiScore}</p>
          <p className="mt-1 text-xs text-green-100/75">
            AI realism stats: {aiAccuracy == null ? "-" : `${aiAccuracy}% accuracy`} · {avgAiMs == null ? "-" : `${(avgAiMs / 1000).toFixed(1)}s avg response`}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => startBattle(difficulty || "adaptive")}
              disabled={isLoadingQuestions}
              className="rounded-xl bg-green-400 px-5 py-2.5 text-sm font-black text-[#052914] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingQuestions ? "Preparing questions..." : "Rematch"}
            </button>
            {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[])
              .filter((level) => level !== difficulty)
              .map((level) => (
                <button
                  key={`rematch-${level}`}
                  onClick={() => startBattle(level)}
                  disabled={isLoadingQuestions}
                  className="rounded-xl border border-green-300/40 bg-green-500/15 px-4 py-2 text-sm font-bold text-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Try {DIFFICULTY_CONFIG[level].label}
                </button>
              ))}
          </div>

          <div className="mt-5 rounded-xl border border-indigo-300/30 bg-indigo-500/10 p-4">
            <p className="text-sm font-bold text-indigo-100">Beat the AI? Prove it.</p>
            <p className="mt-1 text-xs text-indigo-100/80">
              No account needed to share -- copy your result and send it to a friend.
            </p>
            <button
              type="button"
              onClick={handleCopyResult}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-400 to-indigo-400 px-5 py-2.5 text-sm font-black text-[#1a0524] transition-transform duration-200 active:scale-95"
            >
              {resultCopied ? "Copied! Send it to a friend." : "Copy Result to Challenge a Friend"}
            </button>
            <Link
              href={`/signup?redirect=${encodeURIComponent("/create")}`}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-indigo-300/30 bg-transparent px-5 py-2 text-xs font-bold text-indigo-100/80 transition-colors duration-150 hover:bg-indigo-500/10"
            >
              Or create an account to save this result
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
