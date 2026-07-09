"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";

type CoachAction =
  | "ask"
  | "explain_easier"
  | "hint_mode"
  | "quiz_me"
  | "mistake_mode"
  | "study_plan"
  | "rematch_mode"
  | "explain_text";

type CoachMode =
  | "explain"
  | "hint"
  | "quiz"
  | "mistake"
  | "plan"
  | "rematch";

type CoachMessage = {
  role: "user" | "assistant";
  content: string;
};

type MissedQuestion = {
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  topic: string;
  explanation: string;
};

type MistakeDnaEntry = {
  questionId?: string;
  topic: string;
  selectedAnswer: string;
  correctAnswer: string;
  misunderstoodConcept?: string;
  mistakeType?: string;
};

type MasteryProgressEntry = {
  label: string;
  value?: number;
  details?: string;
};

type GigglesCoachProps = {
  deckId?: string;
  matchId?: string;
  deckTitle?: string;
  courseName?: string;
  playerName?: string;
  weakTopics?: string[];
  missedQuestions?: MissedQuestion[];
  mistakeDna?: MistakeDnaEntry[];
  battleScore?: number;
  accuracyPercent?: number;
  previousRematches?: number;
  masteryProgress?: MasteryProgressEntry[];
  contextLabel?: string;
  openByDefault?: boolean;
};

function buildWeakTopicHref(deckId: string, weakTopics: string[]): string {
  if (weakTopics.length === 0) return `/battle/${deckId}`;
  return `/battle/${deckId}?mode=weak_topic&topics=${encodeURIComponent(
    weakTopics.join(",")
  )}`;
}

function getModeLabel(mode: CoachMode): string {
  if (mode === "explain") return "Explain Mode";
  if (mode === "hint") return "Hint Mode";
  if (mode === "quiz") return "Quiz Mode";
  if (mode === "mistake") return "Mistake Mode";
  if (mode === "plan") return "Plan Mode";
  return "Rematch Mode";
}

function buildInitialCoachMessage(hasBattleData: boolean): string {
  if (!hasBattleData) {
    return "Play a battle first, and I'll analyze your weak topics.";
  }

    return "I am Nova AI. I loaded your StudyClash context and will coach with specific, battle-based guidance.";
}

function GigglesAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full border border-cyan-300/40 bg-gradient-to-br from-cyan-400/20 via-[#1a1742] to-fuchsia-500/25 shadow-[0_0_22px_-4px_rgba(34,211,238,0.7)]"
      style={{ width: size, height: size }}
    >
      <svg
        className="h-[72%] w-[72%]"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="32" cy="32" r="28" fill="url(#giggles-face)" stroke="#67E8F9" strokeOpacity="0.55" strokeWidth="2" />
        <rect x="18" y="19" width="28" height="20" rx="10" fill="#0A1329" stroke="#93C5FD" strokeOpacity="0.7" strokeWidth="1.8" />
        <circle cx="26" cy="29" r="3.3" fill="#22D3EE" />
        <circle cx="38" cy="29" r="3.3" fill="#A78BFA" />
        <path d="M25 36c2.1 2.2 4.4 3.2 7 3.2 2.6 0 4.9-1 7-3.2" stroke="#E9D5FF" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 11v5" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="9" r="2" fill="#67E8F9" />
        <defs>
          <linearGradient id="giggles-face" x1="8" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#164E63" />
            <stop offset="0.55" stopColor="#1E1B4B" />
            <stop offset="1" stopColor="#581C87" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function GigglesCoach(props: GigglesCoachProps) {
  const {
    deckId,
    matchId,
    deckTitle = "",
    courseName = "",
    playerName = "Student",
    weakTopics = [],
    missedQuestions = [],
    mistakeDna = [],
    battleScore,
    accuracyPercent,
    previousRematches,
    masteryProgress = [],
    contextLabel,
    openByDefault = false,
  } = props;

  const hasBattleData =
    weakTopics.length > 0 ||
    missedQuestions.length > 0 ||
    mistakeDna.length > 0 ||
    typeof battleScore === "number" ||
    typeof accuracyPercent === "number";

  const storageKey = useMemo(() => {
    const keyRoot = matchId || deckId || "global";
    return `studyclash:giggles:session:${keyRoot}`;
  }, [deckId, matchId]);

  const [messages, setMessages] = useState<CoachMessage[]>(() => {
    if (typeof window === "undefined") {
      return [
        {
          role: "assistant",
          content: buildInitialCoachMessage(hasBattleData),
        },
      ];
    }

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return [
          {
            role: "assistant",
            content: buildInitialCoachMessage(hasBattleData),
          },
        ];
      }

      const parsed = JSON.parse(raw) as { messages?: CoachMessage[] };
      const restored = Array.isArray(parsed.messages)
        ? parsed.messages.filter(
            (entry) =>
              (entry.role === "user" || entry.role === "assistant") &&
              typeof entry.content === "string" &&
              entry.content.trim().length > 0
          )
        : [];

      if (restored.length === 0) {
        return [
          {
            role: "assistant",
            content: buildInitialCoachMessage(hasBattleData),
          },
        ];
      }

      return restored.slice(-20);
    } catch {
      return [
        {
          role: "assistant",
          content: buildInitialCoachMessage(hasBattleData),
        },
      ];
    }
  });
  const [input, setInput] = useState("");
  const [selectedMode, setSelectedMode] = useState<CoachMode>("explain");
  const [isOpen, setIsOpen] = useState(() => openByDefault);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rematchHref = useMemo(
    () => (deckId ? buildWeakTopicHref(deckId, weakTopics) : null),
    [deckId, weakTopics]
  );

  useEffect(() => {
    if (messages.length === 0) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-20) }));
  }, [messages, storageKey]);

  async function sendCoachMessage(params: {
    action: CoachAction;
    mode?: CoachMode;
    userMessage: string;
    appendUserMessage?: boolean;
  }) {
    const { action, mode = selectedMode, userMessage, appendUserMessage = true } = params;

    if (!userMessage.trim()) return;

    const nextMessages = appendUserMessage
      ? [...messages, { role: "user" as const, content: userMessage.trim() }]
      : messages;

    if (appendUserMessage) {
      setMessages(nextMessages);
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await authFetch("/api/study-coach", {
        method: "POST",
        body: JSON.stringify({
          action,
          mode,
          message: userMessage,
          deckId,
          matchId,
          deckTitle,
          courseName,
          playerName,
          weakTopics,
          missedQuestions,
          mistakeDna,
          battleScore,
          accuracyPercent,
          previousRematches,
          masteryProgress,
          chatHistory: nextMessages.slice(-10),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
          setError(data?.error || "Nova AI could not respond right now.");
        return;
      }

      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : "I could not generate a good coaching response yet. Try again.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setInput("");
    } catch {
        setError("Nova AI could not respond right now.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendCoachMessage({ action: "ask", userMessage: input });
  }

  async function triggerExplainEasier() {
    const source = input.trim() || "Explain one concept I missed in simple words.";
    await sendCoachMessage({
      action: "explain_easier",
      mode: "explain",
      userMessage: `Explain this easier: ${source}`,
      appendUserMessage: true,
    });
  }

  async function triggerQuizMe() {
    await sendCoachMessage({
      action: "quiz_me",
      mode: "quiz",
      userMessage:
        "Quiz me from my weak topics. Ask one question at a time. Wait for my answer before revealing correctness.",
    });
  }

  async function triggerHint() {
    await sendCoachMessage({
      action: "hint_mode",
      mode: "hint",
      userMessage:
        "Give me a hint for one of my missed questions without revealing the final answer.",
    });
  }

  async function triggerMistakeMode() {
    await sendCoachMessage({
      action: "mistake_mode",
      mode: "mistake",
      userMessage:
        "Why was I wrong? Break down one missed question using wrong-vs-right analysis and include one mini follow-up question.",
    });
  }

  async function triggerStudyPlan() {
    await sendCoachMessage({
      action: "study_plan",
      mode: "plan",
      userMessage:
        "Create a concise study plan based on my mistakes, weak topics, and response-time issues.",
    });
  }

  async function triggerRematchMode() {
    await sendCoachMessage({
      action: "rematch_mode",
      mode: "rematch",
      userMessage:
        "Create weak-topic rematch guidance with exact mode/topics/limit and explain why this is my next best action.",
    });
  }

  const modeButtons: Array<{ mode: CoachMode; label: string }> = [
    { mode: "explain", label: "Explain" },
    { mode: "hint", label: "Hint" },
    { mode: "quiz", label: "Quiz" },
    { mode: "mistake", label: "Mistake" },
    { mode: "plan", label: "Plan" },
    { mode: "rematch", label: "Rematch" },
  ];

  const panelClass = `fixed z-50 transition-transform duration-300 ease-out ${
    isOpen
      ? "translate-y-0 opacity-100"
      : "pointer-events-none translate-y-6 opacity-0"
  } bottom-0 left-0 right-0 h-[78vh] rounded-t-3xl border border-white/15 bg-[#070912]/95 shadow-[0_-8px_40px_-18px_rgba(34,211,238,0.5)] backdrop-blur-xl md:bottom-4 md:left-auto md:right-4 md:top-4 md:h-auto md:w-[390px] md:rounded-3xl`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-cyan-300/35 bg-[#081022]/90 px-3.5 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_30px_-12px_rgba(34,211,238,0.8)] backdrop-blur md:bottom-5 md:right-5"
      >
        <GigglesAvatar size={28} />
        Nova AI
      </button>

      {isOpen && (
        <button
          aria-label="Close Nova AI panel"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside className={panelClass}>
        <div className="flex h-full flex-col p-4 md:p-4.5">
          <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/15 via-[#111430] to-fuchsia-500/15 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <GigglesAvatar />
              <div>
                <p className="text-sm font-bold text-white">Nova AI</p>
                <p className="text-[11px] uppercase tracking-wider text-cyan-200/80">Your battle coach</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/75"
            >
              Close
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {modeButtons.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                onClick={() => setSelectedMode(entry.mode)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  selectedMode === entry.mode
                    ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {contextLabel || deckTitle || "Study Context"} · {getModeLabel(selectedMode)}
          </p>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={triggerExplainEasier}
              disabled={isSending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Explain this easier
            </button>
            <button
              onClick={triggerHint}
              disabled={isSending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Give me a hint
            </button>
            <button
              onClick={triggerQuizMe}
              disabled={isSending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Quiz me
            </button>
            <button
              onClick={triggerMistakeMode}
              disabled={isSending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Why was I wrong?
            </button>
            <button
              onClick={triggerRematchMode}
              disabled={isSending}
              className="rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create weak-topic rematch
            </button>
            <button
              onClick={triggerStudyPlan}
              disabled={isSending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              What should I study next?
            </button>
          </div>

          {rematchHref && (
            <Link
              href={rematchHref}
              className="mb-3 inline-flex items-center justify-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/15 px-3 py-2 text-xs font-bold text-fuchsia-100"
            >
              Start Weak-Topic Rematch
            </Link>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <GigglesAvatar size={42} />
                <p className="mt-3 text-sm font-semibold text-white/85">
                  Play a battle first, and I&apos;ll analyze your weak topics.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                      message.role === "assistant"
                        ? "self-start border border-cyan-400/20 bg-cyan-500/[0.08] text-white/90"
                        : "self-end border border-fuchsia-400/20 bg-fuchsia-500/[0.08] text-white/90"
                    }`}
                  >
                    {message.content}
                  </div>
                ))}

                {isSending && (
                  <div className="self-start rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-3 py-2 text-sm text-white/80">
                    <div className="flex items-center gap-2">
                      <GigglesAvatar size={20} />
                      <span>Nova AI is analyzing your mistakes...</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

          <form onSubmit={handleAskSubmit} className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                hasBattleData
                  ? "Ask about your mistakes, weak topics, or next move..."
                  : "Choose a deck or play a battle first, then ask..."
              }
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/40"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-3.5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
