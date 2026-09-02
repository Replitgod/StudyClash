"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { VoiceCall } from "./VoiceCall";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  VYRA_STREAM_HEADER,
  VYRA_STREAM_META_DELIMITER,
  type VyraStreamMeta,
} from "@/lib/vyraStream";
import { MathText } from "@/app/components/ui/MathText";
import {
  ArrowRightIcon,
  CloseIcon,
  MicIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "@/app/components/app/Icons";

// Vyra: a full chat product inside AceDecks, not a floating widget.
//
// What makes it worth more than a generic chatbot is the context it is
// handed on every turn -- the student's materials, their weakest topics,
// how much of each they have mastered. That is why "quiz me on what I am
// worst at" works here and does not anywhere else.

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Real actions Vyra performed, rendered as links to the actual result. */
  battleAction?: { deckId: string; topics: string[] };
  studyPlanAction?: { planId: string; assessmentName: string };
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
};

const QUICK_STARTS = [
  { label: "Quiz me on my weakest topic", action: "quiz_me" as const, mode: "quiz" as const },
  { label: "Explain what I keep getting wrong", action: "mistake_mode" as const, mode: "mistake" as const },
  { label: "Make me a study plan", action: "study_plan" as const, mode: "plan" as const },
];

function newId(): string {
  return `vyra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function messageId(role: string): string {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VyraChat() {
  const searchParams = useSearchParams();
  const { user, profile, isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const { isReady } = useRequireAuth();
  const { snapshot } = useStudy();

  const [sessionId, setSessionId] = useState<string>(() => newId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didSeedRef = useRef(false);

  const isEmpty = messages.length === 0;

  /* ------------------------------------------------------ context for Vyra */

  const context = useMemo(() => {
    return {
      weakTopics: snapshot.weakTopics.slice(0, 8).map((t) => t.topic),
      masteryProgress: snapshot.decks.slice(0, 6).map((deck) => ({
        label: deck.title,
        value: deck.mastery ?? 0,
        details:
          deck.mastery === null
            ? "not studied yet"
            : `${deck.mastery}% mastered${deck.dueTopics.length ? `, ${deck.dueTopics.length} topics due` : ""}`,
      })),
      deckId: snapshot.weakTopics[0]?.deckId || snapshot.decks[0]?.id,
      deckTitle: snapshot.weakTopics[0]?.deckTitle || snapshot.decks[0]?.title,
    };
  }, [snapshot]);

  /* ---------------------------------------------------------------- history */

  const loadConversations = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const response = await authFetch("/api/vyra/conversations");
      if (!response.ok) return;
      const data = await response.json();
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      // History is a convenience. Failing to load it must not stop chatting.
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(async (id: string) => {
    setIsHistoryOpen(false);
    setError(null);
    try {
      const response = await authFetch(`/api/vyra/conversations/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Could not open that chat.");
      const data = await response.json();
      setSessionId(id);
      setMessages(
        (data.messages || []).map(
          (m: { id: string; role: "user" | "assistant"; content: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })
        )
      );
    } catch {
      setError("We could not open that chat. Please try again.");
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      try {
        await authFetch(`/api/vyra/conversations?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        // Already removed from the list; a refresh will resync if it failed.
      }
      if (id === sessionId) {
        setSessionId(newId());
        setMessages([]);
      }
    },
    [sessionId]
  );

  const startNewChat = useCallback(() => {
    setSessionId(newId());
    setMessages([]);
    setInput("");
    setError(null);
    setIsHistoryOpen(false);
    inputRef.current?.focus();
  }, []);

  /* ----------------------------------------------------------------- send */

  const send = useCallback(
    async (
      text: string,
      action: "ask" | "quiz_me" | "mistake_mode" | "study_plan" = "ask",
      mode: "explain" | "quiz" | "mistake" | "plan" = "explain"
    ): Promise<string> => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return "";

      // Captured as the answer is assembled so voice mode can speak it.
      // The chat transcript is still the source of truth on screen; this is
      // the same text, handed back to the caller.
      let finalReply = "";

      const outgoing: ChatMessage = {
        id: messageId("user"),
        role: "user",
        content: trimmed,
      };
      const history = [...messages, outgoing];

      setMessages(history);
      setInput("");
      setIsSending(true);
      setError(null);

      try {
        const response = await authFetch("/api/vyra-chat", {
          method: "POST",
          body: JSON.stringify({
            action,
            mode,
            sessionId,
            message: trimmed,
            deckId: context.deckId,
            deckTitle: context.deckTitle,
            playerName: profile?.display_name || user?.email?.split("@")[0] || "Student",
            weakTopics: context.weakTopics,
            masteryProgress: context.masteryProgress,
            chatHistory: history.slice(-12).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!response.ok) {
          let payload: { error?: string } | null = null;
          try {
            payload = await response.json();
          } catch {
            // Non-JSON error body: fall through to the generic message.
          }
          throw new Error(
            payload?.error || "Vyra could not answer that right now. Please try again."
          );
        }

        const assistantId = messageId("assistant");
        const isStreamed = response.headers.get(VYRA_STREAM_HEADER) === "1";

        if (!isStreamed || !response.body) {
          const data = await response.json();
          finalReply =
            typeof data?.reply === "string" && data.reply.trim()
              ? data.reply.trim()
              : "I could not put a good answer together. Try asking another way.";
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: finalReply },
          ]);
          return finalReply;
        }

        // Tokens stream as plain text, then a delimiter, then a JSON blob
        // with the finalized reply and any real actions Vyra performed.
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let raw = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (value) {
            raw += decoder.decode(value, { stream: true });
            const cut = raw.indexOf(VYRA_STREAM_META_DELIMITER);
            const visible = cut === -1 ? raw : raw.slice(0, cut);
            finalReply = visible;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: visible } : m))
            );
          }
          if (done) break;
        }

        const cut = raw.indexOf(VYRA_STREAM_META_DELIMITER);
        if (cut !== -1) {
          try {
            const meta = JSON.parse(
              raw.slice(cut + VYRA_STREAM_META_DELIMITER.length)
            ) as VyraStreamMeta;

            if (meta.finalReply?.trim()) finalReply = meta.finalReply.trim();

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: meta.finalReply?.trim() || m.content,
                      battleAction: meta.battleAction,
                      studyPlanAction: meta.studyPlanAction,
                    }
                  : m
              )
            );
          } catch {
            // The visible text already streamed in full; a malformed
            // trailing blob only costs the action buttons.
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Vyra could not answer that right now. Please try again."
        );
      } finally {
        setIsSending(false);
        void loadConversations();
      }

      return finalReply;
    },
    [messages, isSending, sessionId, context, profile, user, loadConversations]
  );

  // A material workspace can hand Vyra its subject: /vyra?about=Photosynthesis
  useEffect(() => {
    if (didSeedRef.current) return;
    const about = searchParams.get("about");
    if (!about) return;
    didSeedRef.current = true;
    setInput(`Help me understand ${about}.`);
    inputRef.current?.focus();
  }, [searchParams]);

  // Keep the newest message in view as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  /* ----------------------------------------------------------------- view */

  if (isAuthLoading || !isReady) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton mt-8 h-[120px] w-full" />
      </div>
    );
  }

  const composer = isCalling ? (
    <VoiceCall onClose={() => setIsCalling(false)} />
  ) : (
    <div className="card flex items-end gap-2 p-2">
      <label htmlFor="vyra-input" className="visually-hidden">
        Ask Vyra anything
      </label>
      <textarea
        id="vyra-input"
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Ask Vyra anything…"
        className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-relaxed outline-none"
        style={{ color: "var(--text-1)" }}
      />
      {/* Talking to Vyra rather than typing at her. Turn-based, on the
          browser's own speech APIs -- see app/vyra/VoiceCall.tsx. */}
      <button
        type="button"
        onClick={() => {
          void trackEvent("vyra_call_started");
          setIsCalling(true);
        }}
        disabled={isSending}
        aria-label="Talk to Vyra"
        title="Talk to Vyra"
        className="btn btn-secondary h-11 w-11 shrink-0 px-0"
      >
        <MicIcon className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        onClick={() => void send(input)}
        disabled={!input.trim() || isSending}
        aria-label="Send"
        className="btn btn-primary h-11 w-11 shrink-0 px-0"
      >
        <SendIcon className="h-[18px] w-[18px]" />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] md:min-h-dvh">
      {/* ---- Conversation sidebar (desktop) ---- */}
      <aside
        className="hidden w-56 shrink-0 flex-col border-r px-2 py-4 lg:flex"
        style={{ borderColor: "var(--line)" }}
      >
        <button type="button" onClick={startNewChat} className="btn btn-secondary btn-sm mx-1">
          <PlusIcon className="h-4 w-4" />
          New chat
        </button>

        <ul className="mt-3 flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => void openConversation(conversation.id)}
                className="flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--panel-raised)]"
                style={{
                  color:
                    conversation.id === sessionId ? "var(--text-1)" : "var(--text-3)",
                  background:
                    conversation.id === sessionId ? "var(--panel-raised)" : undefined,
                }}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                onClick={() => void deleteConversation(conversation.id)}
                aria-label={`Delete ${conversation.title}`}
                className="rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                style={{ color: "var(--text-4)" }}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
          {conversations.length === 0 && (
            <li className="t-meta px-2.5 py-2">No chats yet.</li>
          )}
        </ul>
      </aside>

      {/* ---- Conversation ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isEmpty ? (
          /* Empty state: centred composer, the way a blank chat should feel. */
          <div className="flex flex-1 items-center justify-center px-5 py-10">
            <div className="w-full max-w-2xl">
              <h1 className="t-page text-center">What can I help you learn?</h1>
              <div className="mt-7">{composer}</div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {QUICK_STARTS.map((quick) => (
                  <button
                    key={quick.label}
                    type="button"
                    disabled={isSending}
                    onClick={() => void send(quick.label, quick.action, quick.mode)}
                    className="chip transition-colors hover:border-[var(--line-strong)]"
                  >
                    {quick.label}
                  </button>
                ))}
              </div>

              {snapshot.weakTopics.length > 0 && (
                <p className="t-meta mt-5 text-center">
                  Vyra knows your materials — right now you are weakest on{" "}
                  <span style={{ color: "var(--text-2)" }}>
                    {snapshot.weakTopics[0].topic}
                  </span>
                  .
                </p>
              )}

              {error && (
                <p role="alert" className="mt-4 text-center text-[14px]" style={{ color: "var(--bad)" }}>
                  {error}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-3 lg:px-6">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="btn btn-quiet btn-sm lg:hidden"
              >
                Chats
              </button>
              <button
                type="button"
                onClick={startNewChat}
                className="btn btn-quiet btn-sm ml-auto"
              >
                <PlusIcon className="h-4 w-4" />
                New chat
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 lg:px-6">
              <div className="mx-auto w-full max-w-2xl pb-6">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="mb-6 flex justify-end">
                      <p
                        className="max-w-[85%] rounded-[var(--radius-lg)] px-4 py-2.5 text-[15px] leading-relaxed"
                        style={{ background: "var(--panel-raised)", color: "var(--text-1)" }}
                      >
                        {message.content}
                      </p>
                    </div>
                  ) : (
                    /* Assistant replies are plain prose, not a coloured
                       bubble -- long explanations are read, not skimmed. */
                    <div key={message.id} className="mb-7">
                      <div
                        className="text-[15.5px] leading-[1.75]"
                        style={{ color: "var(--text-2)" }}
                      >
                        {message.content
                          .split(/\n{2,}/)
                          .filter(Boolean)
                          .map((paragraph, index) => (
                            <p key={index} className="mb-3.5 last:mb-0">
                              <MathText text={paragraph} />
                            </p>
                          ))}
                        {!message.content && isSending && (
                          <span className="t-meta">Thinking…</span>
                        )}
                      </div>

                      {message.battleAction && (
                        <Link
                          href={`/battle/${message.battleAction.deckId}${
                            message.battleAction.topics.length
                              ? `?mode=weak_topic&topics=${message.battleAction.topics
                                  .map(encodeURIComponent)
                                  .join(",")}`
                              : ""
                          }`}
                          className="btn btn-secondary btn-sm mt-3"
                        >
                          Practise this now
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      )}

                      {message.studyPlanAction && (
                        <Link
                          href={`/study-plans/${message.studyPlanAction.planId}`}
                          className="btn btn-secondary btn-sm mt-3"
                        >
                          Open your plan
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  )
                )}

                {error && (
                  <p role="alert" className="text-[14px]" style={{ color: "var(--bad)" }}>
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="px-4 pb-5 lg:px-6">
              <div className="mx-auto w-full max-w-2xl">{composer}</div>
            </div>
          </>
        )}
      </div>

      {/* ---- Conversation sidebar (mobile sheet) ---- */}
      {isHistoryOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          style={{ background: "rgb(0 0 0 / 0.5)" }}
          onClick={() => setIsHistoryOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 flex w-72 flex-col px-2 py-4"
            style={{ background: "var(--app-bg)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 px-1">
              <button type="button" onClick={startNewChat} className="btn btn-secondary btn-sm flex-1">
                <PlusIcon className="h-4 w-4" />
                New chat
              </button>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close"
                className="btn btn-quiet btn-sm"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className="w-full truncate rounded-lg px-2.5 py-2.5 text-left text-[14px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    {conversation.title}
                  </button>
                </li>
              ))}
              {conversations.length === 0 && (
                <li className="t-meta px-2.5 py-2">No chats yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
