"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { FLOATING_ACTION, UI_Z_INDEX } from "@/lib/uiLayout";

type CoachAction =
  | "ask"
  | "explain_easier"
  | "hint_mode"
  | "quiz_me"
  | "mistake_mode"
  | "study_plan"
  | "rematch_mode"
  | "next_topic";

type CoachMode =
  | "explain"
  | "hint"
  | "quiz"
  | "mistake"
  | "plan"
  | "rematch";

type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
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

type CurrentQuestionContext = {
  questionText?: string;
  selectedAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
};

type BattleHistoryEntry = {
  score?: number;
  accuracyPercent?: number;
  deckTitle?: string;
  createdAt?: string;
};

type VyraCoachProps = {
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
  currentQuestion?: CurrentQuestionContext;
  recentBattleHistory?: BattleHistoryEntry[];
  layout?: "floating" | "docked";
};

function buildWeakTopicHref(deckId: string, weakTopics: string[]): string {
  if (weakTopics.length === 0) return `/battle/${deckId}`;
  return `/battle/${deckId}?mode=weak_topic&topics=${encodeURIComponent(
    weakTopics.join(",")
  )}`;
}

function createMessage(role: "user" | "assistant", content: string): CoachMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function initialMessage(hasBattleData: boolean): string {
  if (!hasBattleData) {
    return "Play a battle first, and I'll analyze your weak topics. You can also ask me about a topic directly.";
  }

  return "VYRA is ready. Ask for hints, mistake analysis, quiz mode, or your next best study action.";
}

function VYRAAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full border border-cyan-300/35 bg-gradient-to-br from-cyan-400/20 via-[#0d1b2a] to-emerald-500/20 shadow-[0_0_26px_-10px_rgba(34,211,238,0.8)]"
      style={{ width: size, height: size }}
    >
      <svg
        className="h-[74%] w-[74%]"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="32" cy="32" r="28" fill="url(#vyra-core)" stroke="#67E8F9" strokeOpacity="0.45" strokeWidth="2" />
        <rect x="17" y="20" width="30" height="19" rx="9.5" fill="#081222" stroke="#93C5FD" strokeOpacity="0.7" strokeWidth="1.8" />
        <circle cx="26" cy="29" r="3.2" fill="#22D3EE" />
        <circle cx="38" cy="29" r="3.2" fill="#6EE7B7" />
        <path d="M25 35.8c2.4 2.2 4.8 3.3 7 3.3 2.2 0 4.6-1.1 7-3.3" stroke="#D1FAE5" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 11v5.4" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="9" r="2" fill="#67E8F9" />
        <defs>
          <linearGradient id="vyra-core" x1="8" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#083344" />
            <stop offset="0.58" stopColor="#0f172a" />
            <stop offset="1" stopColor="#14532d" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

const QUICK_ACTIONS: Array<{
  label: string;
  action: CoachAction;
  mode: CoachMode;
  message: string;
  primary?: boolean;
}> = [
  {
    label: "Explain this easier",
    action: "explain_easier",
    mode: "explain",
    message: "Explain this easier in simple words, linked to my weak topics.",
  },
  {
    label: "Quiz me",
    action: "quiz_me",
    mode: "quiz",
    message: "Quiz me on my weakest topic. Ask one question at a time.",
  },
  {
    label: "Give me a hint",
    action: "hint_mode",
    mode: "hint",
    message: "Give me a hint first and do not reveal the final answer yet.",
  },
  {
    label: "Why was I wrong?",
    action: "mistake_mode",
    mode: "mistake",
    message: "Why was I wrong? Break down one missed question using my data.",
  },
  {
    label: "Make a study plan",
    action: "study_plan",
    mode: "plan",
    message: "Make a short study plan from my weak topics and Mistake DNA.",
  },
  {
    label: "Create weak-topic rematch",
    action: "rematch_mode",
    mode: "rematch",
    message: "Create a weak-topic rematch setup with exact mode and focus topics.",
    primary: true,
  },
  {
    label: "What should I study next?",
    action: "next_topic",
    mode: "plan",
    message: "What should I study next right now and why?",
  },
];

export default function VyraCoach(props: VyraCoachProps) {
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
    currentQuestion,
    recentBattleHistory = [],
    layout = "floating",
  } = props;

  const isDocked = layout === "docked";

  const hasBattleData =
    weakTopics.length > 0 ||
    missedQuestions.length > 0 ||
    mistakeDna.length > 0 ||
    !!currentQuestion?.questionText ||
    recentBattleHistory.length > 0 ||
    typeof battleScore === "number" ||
    typeof accuracyPercent === "number";

  const storageKey = useMemo(() => {
    const keyRoot = matchId || deckId || "global";
    return `studyclash:vyra:session:${keyRoot}`;
  }, [deckId, matchId]);

  const legacyStorageKey = useMemo(() => {
    const keyRoot = matchId || deckId || "global";
    return `studyclash:giggles:session:${keyRoot}`;
  }, [deckId, matchId]);

  const [messages, setMessages] = useState<CoachMessage[]>(() => {
    if (typeof window === "undefined") {
      return [createMessage("assistant", initialMessage(hasBattleData))];
    }

    try {
      const raw =
        window.sessionStorage.getItem(storageKey) ||
        window.sessionStorage.getItem(legacyStorageKey);
      if (!raw) {
        return [createMessage("assistant", initialMessage(hasBattleData))];
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

      return restored.length > 0
        ? restored.slice(-30)
        : [createMessage("assistant", initialMessage(hasBattleData))];
    } catch {
      return [createMessage("assistant", initialMessage(hasBattleData))];
    }
  });

  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(() => openByDefault || isDocked);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CoachMode>("explain");

  const listEndRef = useRef<HTMLDivElement | null>(null);

  const rematchHref = useMemo(
    () => (deckId ? buildWeakTopicHref(deckId, weakTopics) : null),
    [deckId, weakTopics]
  );

  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-30) }));
    window.sessionStorage.removeItem(legacyStorageKey);
  }, [legacyStorageKey, messages, storageKey]);

  useEffect(() => {
    if (!listEndRef.current) return;
    listEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, isOpen]);

  async function sendCoachMessage(params: {
    action: CoachAction;
    mode?: CoachMode;
    userMessage: string;
  }) {
    const { action, mode = selectedMode, userMessage } = params;
    const trimmed = userMessage.trim();
    if (!trimmed) return;

    const userEntry = createMessage("user", trimmed);
    const nextMessages = [...messages, userEntry];
    setMessages(nextMessages);
    setIsSending(true);
    setError(null);

    try {
      const response = await authFetch("/api/vyra-chat", {
        method: "POST",
        body: JSON.stringify({
          action,
          mode,
          message: trimmed,
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
          currentQuestion,
          recentBattleHistory,
          chatHistory: nextMessages.slice(-12).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "VYRA could not analyze this right now. Try again, or ask about a specific question.");
        return;
      }

      const reply =
        typeof data?.reply === "string" && data.reply.trim().length > 0
          ? data.reply.trim()
          : "I could not generate a strong response yet. Try another angle.";

      setMessages((prev) => [...prev, createMessage("assistant", reply)]);
      setInput("");
    } catch {
      setError("VYRA could not analyze this right now. Try again, or ask about a specific question.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendCoachMessage({ action: "ask", mode: selectedMode, userMessage: input });
  }

  async function handleQuickAction(entry: (typeof QUICK_ACTIONS)[number]) {
    setSelectedMode(entry.mode);
    await sendCoachMessage({
      action: entry.action,
      mode: entry.mode,
      userMessage: entry.message,
    });
  }

  // z-index is set via inline style={{ zIndex: UI_Z_INDEX.vyraPanel }} below,
  // not a hardcoded Tailwind z-* class, so the shared uiLayout.ts tier stays
  // the single source of truth for stacking order.
  const desktopPanelClass = `fixed right-0 top-0 hidden h-full w-full max-w-[460px] border-l border-cyan-300/15 bg-[#040a12]/95 shadow-[-26px_0_72px_-36px_rgba(16,185,129,0.55)] backdrop-blur-xl transition-transform duration-300 ease-out md:block ${
    isOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
  }`;

  const mobilePanelClass = `fixed inset-x-0 bottom-0 h-[88dvh] rounded-t-3xl border border-cyan-300/20 bg-[#040a12]/95 p-3 shadow-[0_-24px_70px_-30px_rgba(16,185,129,0.6)] backdrop-blur-xl transition-transform duration-300 ease-out ${
    isDocked ? "xl:hidden" : "md:hidden"
  } ${isOpen ? "translate-y-0" : "pointer-events-none translate-y-full"}`;

  const launcherClass = isDocked
    ? `${FLOATING_ACTION.base} ${FLOATING_ACTION.right} flex items-center gap-2 rounded-full border border-cyan-300/40 bg-[#06121f]/90 px-3.5 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_34px_-16px_rgba(34,211,238,0.85)] backdrop-blur transition duration-200 hover:scale-[1.02] xl:hidden`
    : `${FLOATING_ACTION.base} ${FLOATING_ACTION.right} flex items-center gap-2 rounded-full border border-cyan-300/40 bg-[#06121f]/90 px-3.5 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_34px_-16px_rgba(34,211,238,0.85)] backdrop-blur transition duration-200 hover:scale-[1.02] ${FLOATING_ACTION.desktopRightRail}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Toggle VYRA AI coach"
        className={`${launcherClass} ${isOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
        style={{ zIndex: UI_Z_INDEX.floatingAction }}
      >
        <VYRAAvatar size={34} />
        <span className="text-xs font-black uppercase tracking-[0.2em] md:[writing-mode:vertical-rl] md:[text-orientation:mixed]">
          VYRA
        </span>
      </button>

      {isOpen && (
        <button
          aria-label="Close VYRA panel"
          onClick={() => setIsOpen(false)}
          className={`fixed inset-0 bg-black/45 backdrop-blur-[1px] ${isDocked ? "xl:hidden" : ""}`}
          style={{ zIndex: UI_Z_INDEX.vyraPanel - 1 }}
        />
      )}

      {isDocked ? (
        <aside className="hidden w-full max-w-[440px] xl:block">
          <div
            className="sticky top-20 h-[calc(100dvh-6rem)] rounded-2xl border border-cyan-300/15 bg-[#040a12]/95 p-3 shadow-[-26px_0_72px_-36px_rgba(16,185,129,0.45)] backdrop-blur-xl"
            style={{ zIndex: UI_Z_INDEX.vyraPanel }}
          >
            <ChatPanel
              isSending={isSending}
              messages={messages}
              input={input}
              setInput={setInput}
              onSubmit={handleAskSubmit}
              error={error}
              rematchHref={rematchHref}
              contextLabel={contextLabel}
              deckTitle={deckTitle}
              courseName={courseName}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
              onQuickAction={handleQuickAction}
              hasBattleData={hasBattleData}
              closePanel={() => setIsOpen(false)}
              listEndRef={listEndRef}
              showCloseButton={false}
            />
          </div>
        </aside>
      ) : (
        <aside className={desktopPanelClass} style={{ zIndex: UI_Z_INDEX.vyraPanel }}>
          <ChatPanel
            isSending={isSending}
            messages={messages}
            input={input}
            setInput={setInput}
            onSubmit={handleAskSubmit}
            error={error}
            rematchHref={rematchHref}
            contextLabel={contextLabel}
            deckTitle={deckTitle}
            courseName={courseName}
            selectedMode={selectedMode}
            setSelectedMode={setSelectedMode}
            onQuickAction={handleQuickAction}
            hasBattleData={hasBattleData}
            closePanel={() => setIsOpen(false)}
            listEndRef={listEndRef}
            showCloseButton
          />
        </aside>
      )}

      <aside className={mobilePanelClass} style={{ zIndex: UI_Z_INDEX.vyraPanel }}>
        <ChatPanel
          isSending={isSending}
          messages={messages}
          input={input}
          setInput={setInput}
          onSubmit={handleAskSubmit}
          error={error}
          rematchHref={rematchHref}
          contextLabel={contextLabel}
          deckTitle={deckTitle}
          courseName={courseName}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
          onQuickAction={handleQuickAction}
          hasBattleData={hasBattleData}
          closePanel={() => setIsOpen(false)}
          listEndRef={listEndRef}
          showCloseButton
        />
      </aside>
    </>
  );
}

function ChatPanel(props: {
  isSending: boolean;
  messages: CoachMessage[];
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  error: string | null;
  rematchHref: string | null;
  contextLabel?: string;
  deckTitle?: string;
  courseName?: string;
  selectedMode: CoachMode;
  setSelectedMode: (mode: CoachMode) => void;
  onQuickAction: (entry: (typeof QUICK_ACTIONS)[number]) => Promise<void>;
  hasBattleData: boolean;
  closePanel: () => void;
  listEndRef: React.RefObject<HTMLDivElement | null>;
  showCloseButton?: boolean;
}) {
  const {
    isSending,
    messages,
    input,
    setInput,
    onSubmit,
    error,
    rematchHref,
    contextLabel,
    deckTitle,
    courseName,
    selectedMode,
    setSelectedMode,
    onQuickAction,
    hasBattleData,
    closePanel,
    listEndRef,
    showCloseButton = true,
  } = props;

  const modeButtons: Array<{ mode: CoachMode; label: string }> = [
    { mode: "explain", label: "Explain" },
    { mode: "hint", label: "Hint" },
    { mode: "quiz", label: "Quiz" },
    { mode: "mistake", label: "Mistake" },
    { mode: "plan", label: "Plan" },
    { mode: "rematch", label: "Rematch" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-start justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-gradient-to-r from-cyan-500/15 via-[#0d1b2a] to-emerald-500/15 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <VYRAAvatar />
          <div>
            <p className="text-sm font-bold text-white">VYRA AI Coach</p>
            <p className="text-[11px] uppercase tracking-wider text-cyan-200/80">Personal study assistant</p>
          </div>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={closePanel}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/75"
          >
            Close
          </button>
        )}
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {contextLabel || deckTitle || "Study Context"}
        {courseName ? ` · ${courseName}` : ""}
        {` · ${selectedMode}`}
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5">
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

      <div className="mb-2 grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => void onQuickAction(entry)}
            disabled={isSending}
            className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              entry.primary
                ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"
                : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {rematchHref && (
        <Link
          href={rematchHref}
          className="mb-2 inline-flex items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-100"
        >
          Start Weak-Topic Rematch
        </Link>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <VYRAAvatar size={42} />
            <p className="mt-3 text-sm font-semibold text-white/85">
              Ask VYRA about your mistakes, weak topics, or what to study next.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[96%] whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                  message.role === "assistant"
                    ? "self-start border border-cyan-400/20 bg-cyan-500/[0.08] text-white/90"
                    : "self-end border border-emerald-400/20 bg-emerald-500/[0.08] text-white/90"
                }`}
              >
                {message.content}
              </div>
            ))}

            {isSending && (
              <div className="self-start rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-3 py-2 text-sm text-white/80">
                <div className="flex items-center gap-2">
                  <VYRAAvatar size={20} />
                  <span>VYRA is analyzing...</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}

            <div ref={listEndRef} />
          </div>
        )}
      </div>

      {!hasBattleData && (
        <p className="mt-2 text-xs text-cyan-100/70">
          Tip: complete one battle for fully personalized coaching context.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            hasBattleData
              ? "Ask VYRA anything about your study progress..."
              : "Choose a deck, topic, or missed question to begin..."
          }
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/40"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-3.5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
