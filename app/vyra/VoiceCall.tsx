"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/trackEvent";
import { useVoiceTutor } from "@/lib/voice/useVoiceTutor";
import { errorMessage, isLive, statusLabel } from "@/lib/voice/sessionMachine";
import { liveMastery } from "@/lib/voice/tools";
import { summarizeSession } from "@/lib/voice/sessionSummary";
import { normalizeTopic } from "@/lib/voice/topics";
import type {
  Difficulty,
  SessionOptions,
  SourceType,
  StudyStyle,
} from "@/lib/voice/types";

// The call screen.
//
// One thing is on screen at a time and it is always the conversation. The
// orb is driven by real audio rather than a timer, the transcript is the
// only thing that scrolls, and the controls sit in a fixed row at the bottom
// that the transcript can never push off -- which on a phone is the
// difference between a call you can hang up and one you have to close the
// tab to escape.
//
// Every state the machine can be in has exactly one rendering here. That is
// why statusLabel and errorMessage live in sessionMachine rather than in
// JSX: a component that composes its status line out of three booleans will
// eventually claim to be listening while muted, and a student will sit there
// repeating themselves into a dead microphone.

const STYLES: Array<{ id: StudyStyle; label: string; hint: string }> = [
  { id: "adaptive", label: "Adaptive", hint: "Weak spots first, then the rest" },
  { id: "weak_first", label: "Weak spots", hint: "Only what you keep missing" },
  { id: "review_all", label: "Review all", hint: "Straight through the set" },
  { id: "test_me", label: "Test me", hint: "Rapid fire, fewer hints" },
];

const DIFFICULTIES: Array<{ id: Difficulty; label: string }> = [
  { id: "adaptive", label: "Adaptive" },
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

/**
 * What to offer somebody staring at an empty box.
 *
 * Chosen for BREADTH rather than popularity: the one thing this screen has
 * to communicate in two seconds is that the answer to "can she do X" is yes,
 * whatever X is. A list of five science topics would say the opposite.
 */
const TOPIC_SUGGESTIONS = [
  "Quadratic equations",
  "Cellular respiration",
  "The French Revolution",
  "Pointers in C++",
  "SAT punctuation rules",
  "Conversational Spanish",
  "Supply and demand",
  "NCLEX prioritisation",
];

const LENGTHS: Array<{ id: number | null; label: string }> = [
  { id: null, label: "Until I stop" },
  { id: 5, label: "5 min" },
  { id: 10, label: "10 min" },
  { id: 15, label: "15 min" },
];

export type VoiceCallProps = {
  onClose: () => void;
  /** What the student launched this from. Defaults to their recent material. */
  sourceType?: SourceType;
  sourceId?: string | null;
  /** Shown before the session loads, so the screen is never nameless. */
  sourceTitle?: string | null;
  /**
   * A subject to open the topic box with.
   *
   * Set when the student arrived already saying what they wanted -- a
   * ?topic= link, or whatever they had typed in the chat box when they
   * reached for the microphone. It seeds the field rather than starting the
   * call, because a browser grants neither a microphone nor audio playback
   * on a navigation alone.
   */
  initialTopic?: string | null;
};

export function VoiceCall({
  onClose,
  sourceType = "open",
  sourceId = null,
  sourceTitle = null,
  initialTopic = null,
}: VoiceCallProps) {
  const [options, setOptions] = useState<SessionOptions>({
    style: "adaptive",
    difficulty: "adaptive",
    lengthMinutes: null,
    // Overridden below the moment a topic is named. A deck call is recall;
    // a topic call is teaching, and opening a topic call with a question is
    // how you lose somebody in the first fifteen seconds.
    mode: "quiz",
    level: "unspecified",
  });

  // What they typed, and what survives normalisation. A box holding "um"
  // has no topic in it, so the call falls back to their own material rather
  // than starting a lesson about nothing.
  const [topicInput, setTopicInput] = useState(initialTopic ?? "");
  const topic = normalizeTopic(topicInput);

  const tutor = useVoiceTutor({
    sourceType: topic ? "topic" : sourceType,
    sourceId: topic ? null : sourceId,
    topic,
    options: topic ? { ...options, mode: options.mode === "quiz" ? "learn" : options.mode } : options,
  });
  const {
    state,
    turns,
    tutorSession,
    title,
    seconds,
    level,
    speaker,
    needsTapToHear,
    everHeardYou,
    micPermission,
    summary,
    serverError,
    remainingMinutes,
    textOnly,
    audioRef,
  } = tutor;

  const live = isLive(state);
  const heading = title || sourceTitle;

  const status = statusLabel(state, {
    needsTapToHear,
    // Nothing has been said by either side yet, so the call is waiting on
    // the student rather than stalled.
    awaitingFirstWord: turns.length === 0,
  });

  // The saved review is authoritative -- it was recomputed server-side from
  // the attempts that were actually stored. Falling back to a local
  // computation covers the case where the save failed, so a student whose
  // network dropped at the end still gets told how they did.
  const review = useMemo(() => {
    if (summary) return summary;
    if (state.phase !== "ended") return null;
    return summarizeSession(tutorSession, seconds * 1000);
  }, [summary, state.phase, tutorSession, seconds]);

  const mastery = useMemo(() => liveMastery(tutorSession), [tutorSession]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Voice tutor"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #241a52 0%, var(--app-bg) 62%), var(--app-bg)",
      }}
    >
      {/* Her voice. Attached only after an explicit tap on Start, so autoplay
          policy is never in the way on the first play. playsInline keeps iOS
          from trying to take it fullscreen. */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Screen-reader users get the state as text; the orb is decorative. */}
      <p className="sr-only" aria-live="polite" role="status">
        {status}
      </p>

      <Header
        heading={heading}
        live={live}
        seconds={seconds}
        remainingMinutes={remainingMinutes}
        onClose={() => {
          if (live) tutor.end();
          onClose();
        }}
      />

      {state.phase === "ended" && review ? (
        <Review
          review={review}
          turns={turns}
          onAgain={() => void tutor.start()}
          onClose={onClose}
        />
      ) : (
        <main className="flex min-h-0 flex-1 flex-col items-center px-5">
          <Orb level={level} speaker={speaker} live={live} />

          <p className="t-body mt-6 text-center" aria-hidden="true">
            {status}
          </p>

          {live && (
            <p className="t-meta mt-1 tabular-nums" aria-hidden="true">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </p>
          )}

          {state.phase === "idle" && (
            <Setup
              options={options}
              onChange={setOptions}
              micPermission={micPermission}
              topicInput={topicInput}
              onTopicChange={setTopicInput}
              hasOwnMaterial={Boolean(sourceTitle)}
              materialTitle={sourceTitle}
            />
          )}

          {state.phase === "error" && state.errorKind && (
            <ErrorPanel
              message={serverError || errorMessage(state.errorKind)}
              kind={state.errorKind}
              onRetry={() => void tutor.start()}
              onTextOnly={() => void tutor.start({ textOnly: true })}
            />
          )}

          {needsTapToHear && live && (
            <button type="button" onClick={tutor.enableAudio} className="btn btn-primary mt-5">
              Tap to hear Vyra
            </button>
          )}

          {live && !needsTapToHear && !textOnly && (
            <MicMeter
              level={level}
              muted={state.muted}
              everHeardYou={everHeardYou}
              seconds={seconds}
              onSendNow={tutor.sendNow}
            />
          )}

          {live && mastery.length > 0 && <MasteryStrip rows={mastery} />}

          <Transcript turns={turns} live={live} />

          {live && <TextFallback onSend={tutor.sendText} forced={textOnly} />}
        </main>
      )}

      {state.phase !== "ended" && (
        <Controls
          live={live}
          busy={state.phase === "connecting" || state.phase === "requesting_mic"}
          reconnecting={state.phase === "reconnecting"}
          muted={state.muted}
          phase={state.phase}
          textOnly={textOnly}
          onStart={() => void tutor.start()}
          onEnd={tutor.end}
          onToggleMute={tutor.toggleMute}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function Header({
  heading,
  live,
  seconds,
  remainingMinutes,
  onClose,
}: {
  heading: string | null;
  live: boolean;
  seconds: number;
  remainingMinutes: number | null;
  onClose: () => void;
}) {
  return (
    <header className="flex flex-none items-start gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        className="min-w-0 flex-1 rounded-[var(--radius-lg)] border px-4 py-2.5"
        style={{
          borderColor: "var(--accent-line)",
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
          backdropFilter: "blur(10px)",
        }}
      >
        <p className="t-section">Studying</p>
        <p className="mt-0.5 truncate text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
          {heading || "Whatever you want to work on"}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={live ? "End call and go back" : "Close voice tutor"}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
        style={{ background: "var(--panel-raised)", border: "1px solid var(--line-strong)", color: "var(--text-2)" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {!live && remainingMinutes !== null && remainingMinutes < 10 && (
        <p className="sr-only">{remainingMinutes} minutes of calling left today.</p>
      )}
      {live && seconds > 0 && <span className="sr-only">{seconds} seconds elapsed</span>}
    </header>
  );
}

/**
 * The orb.
 *
 * Transform and opacity only, so this stays on the compositor and never
 * triggers layout -- which is what keeps it cheap enough to run on a phone
 * for ten minutes. The level it reads is already flattened to a constant
 * when the student prefers reduced motion, so there is no second code path
 * to keep in sync here.
 */
function Orb({
  level,
  speaker,
  live,
}: {
  level: number;
  speaker: "student" | "tutor" | null;
  live: boolean;
}) {
  const glow = live ? level : 0;

  return (
    <div className="relative mt-6 flex h-52 w-52 flex-none items-center justify-center sm:h-60 sm:w-60">
      {[0, 1].map((ring) => (
        <span
          key={ring}
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            inset: 0,
            border: "1px solid var(--accent-line)",
            transform: `scale(${0.72 + glow * (ring ? 0.34 : 0.2)})`,
            opacity: 0.16 + glow * (ring ? 0.28 : 0.45),
            transition: "transform 90ms linear, opacity 90ms linear",
          }}
        />
      ))}

      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          height: "8.5rem",
          width: "8.5rem",
          background:
            speaker === "student"
              ? "radial-gradient(circle at 32% 28%, #7fe7c4 0%, var(--neon-green, #34d399) 46%, #14684e 100%)"
              : "radial-gradient(circle at 32% 28%, #b9a8ff 0%, var(--accent) 48%, #4a3596 100%)",
          transform: `scale(${1 + glow * 0.16})`,
          boxShadow: `0 0 ${28 + glow * 70}px ${glow * 14}px rgb(124 106 240 / ${0.22 + glow * 0.34})`,
          transition: "transform 90ms linear, box-shadow 90ms linear, background 200ms ease",
        }}
      />

      <span
        className="relative text-[15px] font-medium tracking-[0.28em]"
        style={{ color: "#ffffff", textShadow: "0 1px 12px rgb(0 0 0 / 0.45)" }}
      >
        VYRA
      </span>
    </div>
  );
}

function Setup({
  options,
  onChange,
  micPermission,
  topicInput,
  onTopicChange,
  hasOwnMaterial,
  materialTitle,
}: {
  options: SessionOptions;
  onChange: (next: SessionOptions) => void;
  micPermission: string;
  topicInput: string;
  onTopicChange: (next: string) => void;
  hasOwnMaterial: boolean;
  materialTitle: string | null;
}) {
  const [open, setOpen] = useState(false);
  const typed = topicInput.trim().length > 0;

  return (
    <div className="mt-5 w-full max-w-md">
      {/* The topic box, first and largest.

          This is the answer to the question every student has about a voice
          tutor in the first two seconds -- "can I ask it about MY thing" --
          and until it existed the honest answer was no: a call could only be
          grounded in a deck they had already built. Leaving it blank still
          does the old thing, which is why it is a box and not a mode. */}
      <label htmlFor="vyra-topic" className="t-section mb-1.5 block">
        What do you want to work on?
      </label>
      <input
        id="vyra-topic"
        type="text"
        value={topicInput}
        onChange={(event) => onTopicChange(event.target.value)}
        placeholder={
          hasOwnMaterial ? `Anything — or leave blank for ${materialTitle}` : "Anything at all"
        }
        maxLength={120}
        autoComplete="off"
        className="w-full rounded-[var(--radius-md)] px-3.5 py-3 text-[16px] outline-none"
        style={{
          background: "var(--panel-raised)",
          border: "1px solid var(--line-strong)",
          color: "var(--text-1)",
        }}
      />

      {!typed && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {TOPIC_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onTopicChange(suggestion)}
              className="rounded-full px-2.5 py-1 text-[12px] transition-colors"
              style={{
                background: "var(--panel-raised)",
                border: "1px solid var(--line)",
                color: "var(--text-2)",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <p className="t-meta mt-3 text-center">
        {typed
          ? "She will teach it from the beginning, and you can change the subject any time by just saying so."
          : hasOwnMaterial
            ? "Leave it blank and she will quiz you on what you have been studying. Interrupt her whenever you like."
            : "Say a subject and she will start teaching. Interrupt her whenever you like."}
      </p>

      {micPermission === "denied" && (
        <p
          className="t-meta mt-3 rounded-[var(--radius-md)] px-3 py-2 text-center"
          style={{ background: "var(--panel-raised)", color: "var(--text-2)" }}
        >
          Microphone access is currently blocked. Allow it from the icon in your address bar,
          or start the call and answer by typing instead.
        </p>
      )}

      {micPermission === "prompt" && (
        <p className="t-meta mt-3 text-center">
          Your browser will ask for the microphone when the call starts. Vyra needs it to hear
          your answers; nothing is recorded once the call ends.
        </p>
      )}

      {/* Defaults work, so the options stay folded away. Phase 21's rule:
          setup should never be a form standing between a student and the
          thing they came to do. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-quiet btn-sm mx-auto mt-4 block"
      >
        {open ? "Hide options" : "Session options"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <OptionRow
            label="Focus"
            items={STYLES.map((s) => ({ id: s.id, label: s.label }))}
            value={options.style}
            onSelect={(id) => onChange({ ...options, style: id as StudyStyle })}
          />
          <OptionRow
            label="Difficulty"
            items={DIFFICULTIES.map((d) => ({ id: d.id, label: d.label }))}
            value={options.difficulty}
            onSelect={(id) => onChange({ ...options, difficulty: id as Difficulty })}
          />
          <OptionRow
            label="Length"
            items={LENGTHS.map((l) => ({ id: String(l.id), label: l.label }))}
            value={String(options.lengthMinutes)}
            onSelect={(id) =>
              onChange({ ...options, lengthMinutes: id === "null" ? null : Number(id) })
            }
          />
        </div>
      )}
    </div>
  );
}

function OptionRow({
  label,
  items,
  value,
  onSelect,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="t-section mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={selected}
              className="rounded-[var(--radius-pill)] px-3 py-2 text-[13px] transition-colors"
              style={{
                minHeight: 40,
                background: selected ? "var(--accent)" : "var(--panel-raised)",
                color: selected ? "var(--on-brand, #fff)" : "var(--text-2)",
                border: `1px solid ${selected ? "var(--accent)" : "var(--line-strong)"}`,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MicMeter({
  level,
  muted,
  everHeardYou,
  seconds,
  onSendNow,
}: {
  level: number;
  muted: boolean;
  everHeardYou: boolean;
  seconds: number;
  onSendNow: () => void;
}) {
  return (
    <div className="mt-5 w-full max-w-xs flex-none">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--panel-raised)" }}
        role="meter"
        aria-label="Microphone level"
        aria-valuenow={Math.round(level * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, level * 130)}%`,
            background: everHeardYou ? "var(--neon-green, #34d399)" : "var(--accent)",
            transition: "width 80ms linear, background-color 150ms ease",
          }}
        />
      </div>

      <p className="t-meta mt-2 text-center">
        {muted
          ? "You are muted"
          : everHeardYou
            ? "Mic is working"
            : seconds > 10
              ? "Not picking you up — say your answer, then tap Send answer"
              : "Say something"}
      </p>

      {/* Always available, not only after a failure. */}
      <button
        type="button"
        onClick={onSendNow}
        disabled={muted}
        className="btn btn-secondary btn-sm mt-2.5 w-full"
      >
        Send answer
      </button>
    </div>
  );
}

/**
 * The live mastery meter.
 *
 * Labelled as an estimate on purpose. It is a read of the same evidence
 * score the hint ladder uses, not a measurement, and presenting it as a
 * percentage without saying so would be claiming a precision this does not
 * have.
 */
function MasteryStrip({
  rows,
}: {
  rows: Array<{ conceptId: string; label: string; percent: number }>;
}) {
  return (
    <div className="mt-4 w-full max-w-xs flex-none">
      <p className="t-section mb-1.5">How it is going <span style={{ opacity: 0.6 }}>· estimate</span></p>
      <ul className="space-y-1.5">
        {rows.slice(0, 3).map((row) => (
          <li key={row.conceptId} className="flex items-center gap-2">
            <span className="t-meta min-w-0 flex-1 truncate">{row.label}</span>
            <span
              className="h-1 w-16 flex-none overflow-hidden rounded-full"
              style={{ background: "var(--panel-raised)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${row.percent}%`,
                  background:
                    row.percent >= 66
                      ? "var(--neon-green, #34d399)"
                      : row.percent >= 33
                        ? "var(--warning, #fbbf24)"
                        : "var(--danger, #f87171)",
                  transition: "width 300ms var(--ease-premium-out)",
                }}
              />
            </span>
            <span className="t-meta w-9 flex-none text-right tabular-nums">{row.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Transcript({
  turns,
  live,
}: {
  turns: Array<{ id: string; role: "student" | "tutor"; text: string }>;
  live: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  if (turns.length === 0) return <div className="min-h-0 flex-1" aria-hidden="true" />;

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        // Stop yanking them back to the bottom the moment they scroll up to
        // re-read something.
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="mt-4 min-h-0 w-full max-w-md flex-1 overflow-y-auto"
      aria-label="Conversation transcript"
      tabIndex={0}
    >
      {turns.map((turn) => (
        <p key={turn.id} className="t-meta mb-2 leading-relaxed">
          <span
            style={{ color: turn.role === "tutor" ? "var(--accent-bright)" : "var(--text-3)" }}
          >
            {turn.role === "tutor" ? "Vyra" : "You"}:{" "}
          </span>
          <span style={{ color: "var(--text-2)" }}>{turn.text}</span>
        </p>
      ))}
      {live && <div className="h-2" />}
    </div>
  );
}

/**
 * Typing, as a first-class way to answer.
 *
 * Not only a failure path: a student in a library who cannot speak out loud
 * still gets the whole tutor. When the microphone genuinely failed it is
 * opened by default, because in that case it is the only way in.
 */
function TextFallback({ onSend, forced }: { onSend: (text: string) => void; forced: boolean }) {
  const [open, setOpen] = useState(forced);
  const [text, setText] = useState("");

  useEffect(() => {
    if (forced) setOpen(true);
  }, [forced]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-quiet btn-sm mt-2 flex-none"
      >
        Type instead
      </button>
    );
  }

  return (
    <form
      className="mt-2 flex w-full max-w-md flex-none gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(text);
        setText("");
      }}
    >
      <label className="sr-only" htmlFor="voice-text-answer">
        Type your answer
      </label>
      <input
        id="voice-text-answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type your answer…"
        autoComplete="off"
        className="field min-w-0 flex-1 rounded-[var(--radius-md)] px-3 py-2 text-[15px]"
        style={{
          background: "var(--panel-raised)",
          border: "1px solid var(--line-strong)",
          color: "var(--text-1)",
          // 16px stops iOS Safari zooming the viewport on focus, which on a
          // call screen scrolls the controls off and looks like a crash.
          fontSize: 16,
        }}
      />
      <button type="submit" disabled={!text.trim()} className="btn btn-secondary btn-sm">
        Send
      </button>
    </form>
  );
}

function ErrorPanel({
  message,
  kind,
  onRetry,
  onTextOnly,
}: {
  message: string;
  kind: string;
  onRetry: () => void;
  onTextOnly: () => void;
}) {
  // A microphone problem is the one failure where the session itself is
  // still perfectly available, so it gets the door rather than a dead end.
  const micProblem = kind === "mic_denied" || kind === "mic_missing" || kind === "mic_busy";

  return (
    <div className="mt-5 w-full max-w-sm flex-none">
      <p role="alert" className="t-meta text-center" style={{ color: "var(--text-2)" }}>
        {message}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onRetry} className="btn btn-primary btn-sm">
          Try again
        </button>
        {micProblem && (
          <button type="button" onClick={onTextOnly} className="btn btn-secondary btn-sm">
            Continue by typing
          </button>
        )}
      </div>
    </div>
  );
}

function Review({
  review,
  turns,
  onAgain,
  onClose,
}: {
  review: import("@/lib/voice/types").SessionSummary;
  turns: Array<{ id: string; role: "student" | "tutor"; text: string }>;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const { stats } = review;
  const minutes = Math.max(1, Math.round(stats.durationMs / 60000));

  // Whether a student reads the review at all is the measure of whether it
  // was worth computing, so it is worth knowing.
  useEffect(() => {
    void trackEvent("voice_summary_viewed", {
      questionCount: stats.questionCount,
      correctCount: stats.correctCount,
    });
  }, [stats.questionCount, stats.correctCount]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
      <div className="mx-auto w-full max-w-md">
        <h2 className="t-page mt-6 text-center">Session complete</h2>
        <p className="t-body mt-3 text-center" style={{ color: "var(--text-2)" }}>
          {review.headline}
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-2">
          <Stat label="Answered" value={String(stats.questionCount)} />
          <Stat label="Correct" value={String(stats.correctCount)} />
          <Stat label="Minutes" value={String(minutes)} />
        </dl>

        {review.strengths.length > 0 && (
          <Section title="What you did well">
            <ul className="space-y-1">
              {review.strengths.map((item) => (
                <li key={item} className="t-meta">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.weaknesses.length > 0 && (
          <Section title="Needs more work">
            <ul className="space-y-1">
              {review.weaknesses.map((item) => (
                <li key={item} className="t-meta">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {review.misconceptions.length > 0 && (
          <Section title="Mistakes to review">
            <ul className="space-y-1">
              {review.misconceptions.map((item) => (
                <li key={item} className="t-meta">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Do this next">
          <p className="t-meta">{review.recommendation}</p>
        </Section>

        {turns.length > 0 && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-expanded={showTranscript}
              className="btn btn-quiet btn-sm"
            >
              {showTranscript ? "Hide transcript" : `Read the transcript (${turns.length})`}
            </button>

            {showTranscript && (
              <div className="mt-3 max-h-64 overflow-y-auto" tabIndex={0}>
                {turns.map((turn) => (
                  <p key={turn.id} className="t-meta mb-2 leading-relaxed">
                    <span
                      style={{
                        color: turn.role === "tutor" ? "var(--accent-bright)" : "var(--text-3)",
                      }}
                    >
                      {turn.role === "tutor" ? "Vyra" : "You"}:{" "}
                    </span>
                    <span style={{ color: "var(--text-2)" }}>{turn.text}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onAgain} className="btn btn-primary">
            Practise again
          </button>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[var(--radius-md)] px-3 py-2.5 text-center"
      style={{ background: "var(--panel-raised)", border: "1px solid var(--line)" }}
    >
      <dt className="t-section">{label}</dt>
      <dd className="mt-0.5 text-[20px] font-medium tabular-nums" style={{ color: "var(--text-1)" }}>
        {value}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="t-section mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Controls({
  live,
  busy,
  reconnecting,
  muted,
  phase,
  textOnly,
  onStart,
  onEnd,
  onToggleMute,
  onClose,
}: {
  live: boolean;
  busy: boolean;
  reconnecting: boolean;
  muted: boolean;
  phase: string;
  textOnly: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const showCallControls = live || reconnecting;

  return (
    <footer className="flex flex-none items-center justify-center gap-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
      {showCallControls ? (
        <>
          {!textOnly && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              className="flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                background: muted ? "var(--accent)" : "var(--panel-raised)",
                border: "1px solid var(--line-strong)",
                color: muted ? "var(--on-brand, #fff)" : "var(--text-1)",
              }}
            >
              <MicIcon className="h-6 w-6" muted={muted} />
            </button>
          )}

          <button
            type="button"
            onClick={onEnd}
            aria-label="End call"
            className="flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{ background: "#e5484d", color: "#ffffff" }}
          >
            <EndCallIcon className="h-6 w-6" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="btn btn-primary btn-lg"
          >
            {busy
              ? phase === "requesting_mic"
                ? "Allow microphone…"
                : "Connecting…"
              : phase === "error"
                ? "Try again"
                : "Start call"}
          </button>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-lg">
            Back
          </button>
        </>
      )}
    </footer>
  );
}

function MicIcon({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

function EndCallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* A handset rotated down: the universal "hang up". */}
      <g transform="rotate(135 12 12)">
        <path d="M4.5 5.5a2 2 0 0 1 2-2h1.6a1 1 0 0 1 1 .77l.7 3a1 1 0 0 1-.29.95l-1.3 1.2a12 12 0 0 0 5.1 5.1l1.2-1.3a1 1 0 0 1 .95-.29l3 .7a1 1 0 0 1 .77 1v1.6a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5Z" />
      </g>
    </svg>
  );
}
