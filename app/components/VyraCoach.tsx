"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/authFetch";
import { FLOATING_ACTION, OPEN_FEEDBACK_EVENT, UI_Z_INDEX } from "@/lib/uiLayout";
import {
  VYRA_STREAM_HEADER,
  VYRA_STREAM_META_DELIMITER,
  type VyraStreamMeta,
  type VyraBattleAction,
  type VyraStudyPlanAction,
} from "@/lib/vyraStream";
import { popIn, pressableSubtle } from "@/lib/motion";

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

type ResourceRecommendation = {
  title: string;
  source: string;
  url: string;
  whyChosen: string;
  estimatedStudyTime: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "mixed";
  resourceType: string;
  trustTier: "official" | "reputable" | "community";
};

type BlindspotDeck = {
  deckId: string;
  deckTitle: string;
  topics: string[];
  accuracy: number;
};

type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  resources?: ResourceRecommendation[];
  resourcesDisclaimer?: string;
  blindspotDecks?: BlindspotDeck[];
  battleAction?: VyraBattleAction;
  studyPlanAction?: VyraStudyPlanAction;
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
  // Set by the caller to a value that changes once per missed question (e.g.
  // `${questionId}:${selectedAnswer}`) to have VYRA open with a mistake
  // breakdown automatically, instead of waiting for the student to click
  // "Why was I wrong?" themselves. Leave undefined/null for on-demand-only
  // coaching (e.g. the Mastery Map, where there's no single "just missed"
  // question to react to).
  autoAnalyzeSignal?: string | null;
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
      className="relative flex items-center justify-center rounded-full border border-indigo-300/35 bg-gradient-to-br from-indigo-400/20 via-[#0d1b2a] to-green-500/20 shadow-[0_0_26px_-10px_rgba(79,70,229,0.8)]"
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
    autoAnalyzeSignal = null,
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
    return `acediq:vyra:session:${keyRoot}`;
  }, [deckId, matchId]);

  const legacyStorageKey = useMemo(() => {
    const keyRoot = matchId || deckId || "global";
    return `acediq:giggles:session:${keyRoot}`;
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

      if (!response.ok) {
        let data: { error?: string } | null = null;
        try {
          data = await response.json();
        } catch {
          // Non-JSON error body (e.g. a proxy/server error page) -- fall through to the generic message.
        }
        setError(data?.error || "VYRA could not analyze this right now. Try again, or ask about a specific question.");
        return;
      }

      const isStreamed = response.headers.get(VYRA_STREAM_HEADER) === "1";

      if (!isStreamed || !response.body) {
        const data = await response.json();
        const reply =
          typeof data?.reply === "string" && data.reply.trim().length > 0
            ? data.reply.trim()
            : "I could not generate a strong response yet. Try another angle.";

        const resources: ResourceRecommendation[] = Array.isArray(data?.resources) ? data.resources : [];

        setMessages((prev) => [
          ...prev,
          {
            ...createMessage("assistant", reply),
            resources: resources.length > 0 ? resources : undefined,
            resourcesDisclaimer: typeof data?.resourcesDisclaimer === "string" ? data.resourcesDisclaimer : undefined,
          },
        ]);
        setInput("");
        return;
      }

      // Streamed reply: render an empty assistant bubble immediately, then
      // fill it in token-by-token as chunks arrive. The server appends a
      // VYRA_STREAM_META_DELIMITER-prefixed JSON blob after the raw text
      // (see lib/vyraStream.ts) carrying the finalized, post-processed reply
      // plus any grounded resource cards -- swapped in once the stream ends.
      const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ]);
      setInput("");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          fullText += decoder.decode(value, { stream: !done });
          const delimiterIndex = fullText.indexOf(VYRA_STREAM_META_DELIMITER);
          const displayText = delimiterIndex === -1 ? fullText : fullText.slice(0, delimiterIndex);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: displayText } : m))
          );
        }
        if (done) break;
      }

      const delimiterIndex = fullText.indexOf(VYRA_STREAM_META_DELIMITER);
      if (delimiterIndex !== -1) {
        try {
          const meta = JSON.parse(
            fullText.slice(delimiterIndex + VYRA_STREAM_META_DELIMITER.length)
          ) as VyraStreamMeta;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: meta.finalReply || m.content,
                    resources: meta.resources && meta.resources.length > 0 ? meta.resources : undefined,
                    resourcesDisclaimer: meta.resourcesDisclaimer,
                    battleAction: meta.battleAction,
                    studyPlanAction: meta.studyPlanAction,
                  }
                : m
            )
          );
        } catch {
          // Streamed text is already displayed in full; metadata just won't attach.
        }
      }
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

  // Fires the same "Why was I wrong?" breakdown a student would click
  // themselves, but automatically the moment a new missed question comes in
  // -- the ref guards against re-firing on every re-render (the signal only
  // changes once per newly-missed question, but effects re-run on any
  // prop/state change in the same render pass).
  const lastAutoAnalyzedSignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoAnalyzeSignal || autoAnalyzeSignal === lastAutoAnalyzedSignalRef.current) return;
    lastAutoAnalyzedSignalRef.current = autoAnalyzeSignal;

    const mistakeAction = QUICK_ACTIONS.find((entry) => entry.action === "mistake_mode");
    if (!mistakeAction) return;

    // Deferred a tick (same pattern as app/decks/page.tsx's guest-state
    // reset) so the setState calls below don't run synchronously inside the
    // effect body itself -- see react-hooks/set-state-in-effect.
    void Promise.resolve().then(() => {
      setSelectedMode(mistakeAction.mode);
      void sendCoachMessage({
        action: mistakeAction.action,
        mode: mistakeAction.mode,
        userMessage: mistakeAction.message,
      });
    });
    // sendCoachMessage/setSelectedMode are recreated every render; the ref
    // check above (not the dependency array) is what prevents duplicate
    // sends, so only autoAnalyzeSignal needs to be tracked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyzeSignal]);

  async function handleFindResources() {
    const topic = weakTopics[0] || deckTitle || undefined;
    const label = topic || courseName || "your weak topics";

    const userEntry = createMessage("user", `Find trustworthy study resources for ${label}.`);
    setMessages((prev) => [...prev, userEntry]);
    setIsSending(true);
    setError(null);

    try {
      const response = await authFetch("/api/find-resources", {
        method: "POST",
        body: JSON.stringify({
          topic,
          courseName: courseName || undefined,
          weakTopics,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "VYRA could not find resources right now. Try again shortly.");
        return;
      }

      const resources: ResourceRecommendation[] = Array.isArray(data?.resources) ? data.resources : [];
      const summary =
        resources.length > 0
          ? `Found ${resources.length} trustworthy resource${resources.length === 1 ? "" : "s"} for ${label}:`
          : data?.disclaimer || "No confidently trustworthy resources found for this topic right now.";

      setMessages((prev) => [
        ...prev,
        {
          ...createMessage("assistant", summary),
          resources,
          resourcesDisclaimer: resources.length > 0 ? data?.disclaimer : undefined,
        },
      ]);
    } catch {
      setError("VYRA could not find resources right now. Try again shortly.");
    } finally {
      setIsSending(false);
    }
  }

  // Widens the existing weak-topic rematch (buildWeakTopicHref, scoped to
  // one deck) to every deck the signed-in student has, by reading the same
  // topic_review_schedule signal Mastery Map already reads -- see
  // app/api/blindspot-quiz/route.ts.
  async function handleBlindspotQuiz() {
    const userEntry = createMessage("user", "Find my weak spots across all my decks.");
    setMessages((prev) => [...prev, userEntry]);
    setIsSending(true);
    setError(null);

    try {
      const response = await authFetch("/api/blindspot-quiz");
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "VYRA could not check your blindspots right now. Try again shortly.");
        return;
      }

      const decks: BlindspotDeck[] = Array.isArray(data?.decks) ? data.decks : [];
      const summary =
        decks.length > 0
          ? `Found ${decks.length} deck${decks.length === 1 ? "" : "s"} with topics worth a rematch:`
          : data?.message || "No blindspots found yet -- keep battling and VYRA will start spotting patterns.";

      setMessages((prev) => [
        ...prev,
        {
          ...createMessage("assistant", summary),
          blindspotDecks: decks.length > 0 ? decks : undefined,
        },
      ]);
    } catch {
      setError("VYRA could not check your blindspots right now. Try again shortly.");
    } finally {
      setIsSending(false);
    }
  }

  // One panel, not two: a single <aside> whose Tailwind classes reposition
  // it per breakpoint (bottom sheet on mobile, right-side panel on desktop)
  // instead of mounting two separate fixed-overlay instances gated by
  // `hidden`/`md:hidden`. Two parallel copies of the same interactive
  // ChatPanel (message list, textarea, buttons) sitting in the DOM
  // simultaneously -- even with one CSS-hidden -- reads as duplicated
  // interactive content to anything doing DOM-level inspection rather than
  // full layout/visibility evaluation. Tailwind v4 composes translate-x/
  // translate-y into one `transform` via separate CSS custom properties, so
  // the mobile Y-axis slide and desktop X-axis slide can coexist here
  // without fighting each other.
  // z-index is set via inline style={{ zIndex: UI_Z_INDEX.vyraPanel }} below,
  // not a hardcoded Tailwind z-* class, so the shared uiLayout.ts tier stays
  // the single source of truth for stacking order.
  const overlayPanelClass = `fixed inset-x-0 bottom-0 h-[88dvh] rounded-t-3xl border border-indigo-300/20 bg-[#040a12]/95 p-3 shadow-[0_-24px_70px_-30px_rgba(16,185,129,0.6)] backdrop-blur-xl transition-transform duration-300 ease-out md:inset-x-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:w-full md:max-w-[460px] md:translate-y-0 md:rounded-t-none md:rounded-none md:border md:border-y-0 md:border-r-0 md:border-l md:border-indigo-300/15 md:shadow-[-26px_0_72px_-36px_rgba(16,185,129,0.55)] ${
    isDocked ? "xl:hidden" : ""
  } ${isOpen ? "translate-y-0 md:translate-x-0" : "pointer-events-none translate-y-full md:translate-x-full"}`;

  const launcherClass = isDocked
    ? `${FLOATING_ACTION.base} ${FLOATING_ACTION.right} flex items-center gap-2 rounded-full border border-indigo-300/40 bg-[#06121f]/90 px-3.5 py-2.5 text-sm font-semibold text-indigo-100 shadow-[0_0_34px_-16px_rgba(79,70,229,0.85)] backdrop-blur transition duration-200 hover:scale-[1.02] xl:hidden`
    : `${FLOATING_ACTION.base} ${FLOATING_ACTION.right} flex items-center gap-2 rounded-full border border-indigo-300/40 bg-[#06121f]/90 px-3.5 py-2.5 text-sm font-semibold text-indigo-100 shadow-[0_0_34px_-16px_rgba(79,70,229,0.85)] backdrop-blur transition duration-200 hover:scale-[1.02] ${FLOATING_ACTION.desktopRightRail}`;

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

      {/* Docked mode's xl+ sidebar is a genuinely different layout (sticky,
          in document flow, max-width column) from the fixed overlay below,
          not just a repositioned copy of it -- so unlike the desktop/mobile
          overlay pair, this one legitimately stays a separate element. The
          two never show at the same breakpoint: this is xl:block-only, and
          the overlay below turns itself off at xl via isDocked. */}
      {isDocked && (
        <aside className="hidden w-full max-w-[440px] xl:block">
          <div
            className="sticky top-20 h-[calc(100dvh-6rem)] rounded-2xl border border-indigo-300/15 bg-[#040a12]/95 p-3 shadow-[-26px_0_72px_-36px_rgba(16,185,129,0.45)] backdrop-blur-xl"
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
            onFindResources={handleFindResources}
              onBlindspotQuiz={handleBlindspotQuiz}
              hasBattleData={hasBattleData}
              closePanel={() => setIsOpen(false)}
              listEndRef={listEndRef}
              showCloseButton={false}
            />
          </div>
        </aside>
      )}

      <aside className={overlayPanelClass} style={{ zIndex: UI_Z_INDEX.vyraPanel }}>
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
          onFindResources={handleFindResources}
          onBlindspotQuiz={handleBlindspotQuiz}
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
  onFindResources: () => Promise<void>;
  onBlindspotQuiz: () => Promise<void>;
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
    onFindResources,
    onBlindspotQuiz,
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
      <div className="mb-2 flex items-start justify-between gap-3 rounded-2xl border border-indigo-300/25 bg-gradient-to-r from-indigo-500/15 via-[#0d1b2a] to-green-500/15 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <VYRAAvatar />
          <div>
            <p className="text-sm font-bold text-white">VYRA AI Coach</p>
            <p className="text-[11px] uppercase tracking-wider text-indigo-200/80">Personal study assistant</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
            aria-label="Send feedback or report a problem"
            title="Feedback"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-semibold text-white/75"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={closePanel}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-semibold text-white/75"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {contextLabel || deckTitle || "Study Context"}
        {courseName ? ` · ${courseName}` : ""}
        {` · ${selectedMode}`}
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {modeButtons.map((entry) => (
          <motion.button
            key={entry.mode}
            type="button"
            onClick={() => setSelectedMode(entry.mode)}
            {...pressableSubtle}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              selectedMode === entry.mode
                ? "border-indigo-300/45 bg-indigo-400/15 text-indigo-100"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
            }`}
          >
            {entry.label}
          </motion.button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((entry) => (
          <motion.button
            key={entry.label}
            type="button"
            onClick={() => void onQuickAction(entry)}
            disabled={isSending}
            {...(!isSending ? pressableSubtle : {})}
            className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              entry.primary
                ? "border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25"
                : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
            }`}
          >
            {entry.label}
          </motion.button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {rematchHref && (
          <Link
            href={rematchHref}
            className="inline-flex items-center justify-center rounded-xl border border-green-400/35 bg-green-500/15 px-3 py-2 text-xs font-bold text-green-100"
          >
            Start Weak-Topic Rematch
          </Link>
        )}
        <button
          type="button"
          onClick={() => void onFindResources()}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Find Study Resources
        </button>
        <button
          type="button"
          onClick={() => void onBlindspotQuiz()}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/35 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l-3 3m0 0l3 3m-3-3h10.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          My Blindspots
        </button>
      </div>

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
              <motion.div
                key={message.id}
                initial="hidden"
                animate="visible"
                variants={popIn}
                className="flex flex-col gap-2"
              >
                <div
                  className={`max-w-[96%] whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                    message.role === "assistant"
                      ? "self-start border border-indigo-400/20 bg-indigo-500/[0.08] text-white/90"
                      : "self-end border border-green-400/20 bg-green-500/[0.08] text-white/90"
                  }`}
                >
                  {message.content}
                </div>

                {message.resources && message.resources.length > 0 && (
                  <div className="flex flex-col gap-2 self-start w-full max-w-[96%]">
                    {message.resources.map((resource) => (
                      <a
                        key={resource.url}
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="rounded-xl border border-amber-300/25 bg-amber-500/[0.06] p-3 transition-colors hover:border-amber-300/45 hover:bg-amber-500/[0.1]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-white/90">{resource.title}</p>
                          <span
                            className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              resource.trustTier === "official"
                                ? "border-green-300/40 bg-green-500/15 text-green-200"
                                : resource.trustTier === "reputable"
                                  ? "border-indigo-300/40 bg-indigo-500/15 text-indigo-200"
                                  : "border-white/20 bg-white/5 text-white/60"
                            }`}
                          >
                            {resource.trustTier}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-white/50">{resource.source}</p>
                        <p className="mt-1.5 text-xs text-white/75">{resource.whyChosen}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-amber-100/80">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{resource.resourceType.replace(/_/g, " ")}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{resource.difficulty}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{resource.estimatedStudyTime}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {message.resourcesDisclaimer && (
                  <p className="max-w-[96%] self-start text-[11px] text-white/40">{message.resourcesDisclaimer}</p>
                )}

                {message.blindspotDecks && message.blindspotDecks.length > 0 && (
                  <div className="flex flex-col gap-2 self-start w-full max-w-[96%]">
                    {message.blindspotDecks.map((deck) => (
                      <Link
                        key={deck.deckId}
                        href={buildWeakTopicHref(deck.deckId, deck.topics)}
                        className="rounded-xl border border-red-300/25 bg-red-500/[0.06] p-3 transition-colors hover:border-red-300/45 hover:bg-red-500/[0.1]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-white/90">{deck.deckTitle}</p>
                          <span className="flex-shrink-0 rounded-full border border-red-300/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-200">
                            {deck.accuracy}% acc
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-white/75">{deck.topics.join(", ")}</p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-red-100/80">
                          Start rematch
                        </p>
                      </Link>
                    ))}
                  </div>
                )}

                {message.battleAction && (
                  <Link
                    href={buildWeakTopicHref(message.battleAction.deckId, message.battleAction.topics)}
                    className="self-start rounded-xl border border-indigo-300/30 bg-indigo-500/[0.08] px-3.5 py-2.5 text-sm font-bold text-indigo-100 transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.14]"
                  >
                    Start Weak-Topic Rematch →
                  </Link>
                )}

                {message.studyPlanAction && (
                  <Link
                    href={`/study-plans/${message.studyPlanAction.planId}`}
                    className="self-start rounded-xl border border-green-300/30 bg-green-500/[0.08] px-3.5 py-2.5 text-sm font-bold text-green-100 transition-colors hover:border-green-300/50 hover:bg-green-500/[0.14]"
                  >
                    View Your Study Plan: {message.studyPlanAction.assessmentName} →
                  </Link>
                )}
              </motion.div>
            ))}

            {isSending && (
              <div className="self-start rounded-xl border border-indigo-400/25 bg-indigo-500/[0.08] px-3 py-2 text-sm text-white/80">
                <div className="flex items-center gap-2">
                  <VYRAAvatar size={20} />
                  <span>VYRA is analyzing...</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300 [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}

            <div ref={listEndRef} />
          </div>
        )}
      </div>

      {!hasBattleData && (
        <p className="mt-2 text-xs text-indigo-100/70">
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
              ? "Ask VYRA anything, or try \"I have an AP Bio exam Friday on cellular respiration\"..."
              : "Choose a deck, topic, or missed question to begin..."
          }
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-indigo-400/40"
        />
        <motion.button
          type="submit"
          disabled={isSending || !input.trim()}
          {...(!isSending && input.trim() ? pressableSubtle : {})}
          className="rounded-xl bg-gradient-to-r from-green-500 to-indigo-500 px-3.5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </motion.button>
      </form>
    </div>
  );
}
