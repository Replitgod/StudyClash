"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { trackEvent } from "@/lib/trackEvent";
import { PaperclipIcon, ArrowRightIcon, CloseIcon } from "./Icons";

// The one input in AceDecks.
//
// It replaces every "PDF Summarizer" / "Flashcard Generator" / "Quiz
// Generator" / "Create Deck" flow the app used to have as separate pages
// with separate forms. The student gives AceDecks material -- typed, pasted,
// or attached -- and AceDecks decides what to do with it. There is nothing to
// configure: question count, difficulty, and question type are all chosen
// server-side defaults.

// Documents are sent to a serverless function, and the platform refuses any
// request body over about 4.5 MB before our code ever runs -- which surfaced
// as a bare "server error 413" for a 6 MB PDF the UI had just said was under
// the limit. The limit shown here is the one that actually holds.
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_NOTES_CHARACTERS = 120_000;

// Under this many words, an input is a topic ("AP World Unit 3"), not study
// material. AceDecks writes the material itself in that case -- see
// `sourceMode: "topic"` in app/api/generate-questions/route.ts.
const TOPIC_WORD_LIMIT = 25;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

// Everything the file picker will accept. Anything else gets a plain-English
// message instead of a silent no-op, which is what the old upload control did.
const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp,.heic,.heif";

type Stage = "idle" | "reading" | "thinking" | "writing" | "checking" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  reading: "Reading your file",
  thinking: "Writing notes on this topic",
  writing: "Writing your questions and flashcards",
  checking: "Checking every answer",
  done: "Ready",
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** A clean, human title from whatever the student gave us. */
function deriveTitle(input: string, fileName: string | null): string {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (base) return base.slice(0, 80);
  }
  const firstLine = input.trim().split("\n")[0] || "";
  const cleaned = firstLine.replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned.slice(0, 80);
  return "Study material";
}

export type ComposerProps = {
  placeholder?: string;
  autoFocus?: boolean;
  /** Rendered under the input. Kept to at most three quiet actions. */
  footer?: React.ReactNode;
  /**
   * Optional exam track (see lib/examTracks.ts), set when the student came
   * from an exam page or chose an exam in onboarding. It makes the questions
   * match that exam's format; the server ignores anything it does not know.
   */
  examTrack?: string | null;
  /**
   * Example topics offered to a student with nothing to study yet. Tapping
   * one fills the box and focuses it, so the first thing a new account is
   * asked to do is press a button rather than think of a subject and type
   * it out. They live here, not on the calling screen, because the input's
   * text is this component's state -- a caller cannot fill it from outside
   * without a ref or a remount.
   */
  suggestions?: string[];
  /** Text to start with, e.g. a topic Vyra offered to build a set on. */
  initialValue?: string;
};

export function Composer({
  placeholder = "What are you studying?",
  autoFocus = false,
  footer,
  examTrack = null,
  suggestions,
  initialValue = "",
}: ComposerProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { refresh } = useStudy();

  const [value, setValue] = useState(initialValue);
  const [fileName, setFileName] = useState<string | null>(null);
  // Text pulled out of an attachment. Kept separate from `value` so a
  // 40-page PDF does not dump 100,000 characters into the box the student
  // is typing in -- they see a file chip, not a wall of extracted text.
  const [attachedText, setAttachedText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  // A hit free-plan cap is NOT an error. It gets its own state so it can be
  // rendered as an offer rather than as red failure text.
  const [capReached, setCapReached] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isBusy = stage !== "idle" && stage !== "done";

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
  }, []);

  useEffect(() => clearStageTimers, [clearStageTimers]);

  // Grow the textarea with its content instead of scrolling inside a fixed
  // two-line box, which is what makes a long paste feel like it went
  // somewhere rather than disappearing.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  /* --------------------------------------------------------------- files */

  const readFile = useCallback(async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isDocument = [".pdf", ".docx", ".pptx"].some((ext) => lowerName.endsWith(ext));
    const isImage = IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const isText = lowerName.endsWith(".txt") || lowerName.endsWith(".md");

    if (lowerName.endsWith(".doc") || lowerName.endsWith(".ppt")) {
      setError(
        "That's an older Office file. Open it and use File > Save As to save it as .docx or .pptx, then attach it again."
      );
      return;
    }

    if (!isDocument && !isImage && !isText) {
      setError(
        "That file type isn't supported. Attach a PDF, Word or PowerPoint file, a photo, or a .txt file, or paste the text in."
      );
      return;
    }

    const limit = isDocument ? MAX_DOCUMENT_BYTES : isImage ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
    if (file.size > limit) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, and the limit is ${(
          limit /
          1024 /
          1024
        ).toFixed(0)} MB. Try splitting it (one chapter at a time works well), or paste the text in.`
      );
      return;
    }

    setError(null);
    setStage("reading");
    setFileName(file.name);

    try {
      if (isText) {
        const text = await file.text();
        if (!text.trim()) {
          throw new Error("That file looks empty. Try another, or paste the text in directly.");
        }
        setAttachedText(text.slice(0, MAX_NOTES_CHARACTERS));
        setStage("idle");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await authFetch(isDocument ? "/api/extract-pdf" : "/api/extract-image", {
        method: "POST",
        body: formData,
      });

      // A 500 can come back as an HTML error page; parsing that as JSON
      // throws an unhelpful "Unexpected token <".
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          response.status === 413
            ? "That file is too large to upload. Try splitting it, or paste the text in."
            : "We couldn't read that file. Try again, or paste the text in."
        );
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We couldn't read that file.");
      }

      const text = String(data.text || "").trim();
      if (!text) {
        throw new Error(
          "We couldn't find any text in that file. If it's a scan, try a clearer photo, or paste the text in."
        );
      }

      setAttachedText(text.slice(0, MAX_NOTES_CHARACTERS));
      setStage("idle");
    } catch (err) {
      setFileName(null);
      setAttachedText("");
      setStage("idle");
      setError(
        err instanceof Error ? err.message : "We couldn't read that file. Please try another."
      );
    }
  }, []);

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = "";
    if (file) void readFile(file);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  /* ------------------------------------------------------------- generate */

  const start = useCallback(async () => {
    const typed = value.trim();

    // An attachment on its own is a complete submission -- requiring the
    // student to also type something would be asking for input we do not
    // need. Anything they did type alongside a file becomes the focus for
    // the questions.
    const material = attachedText.trim() || typed;

    if (!material) {
      setError("Type what you are studying, or attach your notes.");
      textareaRef.current?.focus();
      return;
    }

    if (!user) {
      router.push("/signup");
      return;
    }

    const isTopic = !attachedText && wordCount(typed) <= TOPIC_WORD_LIMIT;
    const title = deriveTitle(typed, fileName);

    setError(null);
    setCapReached(null);
    clearStageTimers();
    setStage(isTopic ? "thinking" : "writing");

    // Move the label forward while the single request is in flight so the
    // wait reads as progress rather than a frozen screen. The steps are the
    // real ones the server runs, in order; it never claims the last one is
    // done -- the redirect does that.
    const writingAt = isTopic ? 7000 : 0;
    if (isTopic) {
      stageTimersRef.current.push(setTimeout(() => setStage("writing"), writingAt));
    }
    stageTimersRef.current.push(setTimeout(() => setStage("checking"), writingAt + 16000));

    // The activation funnel needs the denominator, not just the wins.
    // deck_generation_started/_failed were declared in lib/trackEvent.ts and
    // never fired, so "first deck generated" could be counted but the rate
    // it converts at -- and any spike in generation failures -- could not.
    trackEvent("deck_generation_started", {
      mode: isTopic ? "topic" : "notes",
      hasAttachment: !!attachedText,
    });

    try {
      const response = await authFetch("/api/generate-questions", {
        method: "POST",
        body: JSON.stringify({
          studentName: profile?.display_name || user.email?.split("@")[0] || "Student",
          deckTitle: title,
          // Where the title came from decides whether the server may improve
          // it: a typed topic or a file name is the student's own; the first
          // line of pasted notes usually is not a title at all.
          titleSource: isTopic ? "topic" : fileName ? "file" : "text",
          notes: material,
          topicFocus: attachedText && typed ? typed.slice(0, 200) : undefined,
          sourceMode: isTopic ? "topic" : "notes",
          examTrack: examTrack || undefined,
          uploadKind: fileName
            ? [".pdf", ".docx", ".pptx"].some((ext) => fileName.toLowerCase().endsWith(ext))
              ? "pdf"
              : IMAGE_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))
                ? "image"
                : "text"
            : "manual",
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          response.status === 504
            ? "That took longer than it should. Please try again; shorter notes finish faster."
            : "Something went wrong on our side. Please try again."
        );
      }

      const data = await response.json();

      // 402 is the billing governor refusing on the monthly map cap
      // (lib/tiers.ts). It is the one "failure" that is really a moment:
      // the student just tried to do the exact thing Pro unlocks, and
      // they have already seen the product work. Showing them red error
      // text here reads as "the app is broken" and wastes it.
      if (response.status === 402) {
        clearStageTimers();
        setStage("idle");
        setCapReached(
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : "You've used all your free study sets this month."
        );
        void trackEvent("generation_cap_reached", { mode: isTopic ? "topic" : "notes" });
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "We couldn't create your study set. Please try again.");
      }

      const deckId = data?.deckId;
      if (!deckId) {
        throw new Error("Your study set was created, but we couldn't open it. You'll find it in your Library.");
      }

      clearStageTimers();
      setStage("done");
      trackEvent("deck_generation_success", {
        deckId,
        mode: isTopic ? "topic" : "notes",
      });

      refresh();
      router.push(`/library/${deckId}?new=1`);
    } catch (err) {
      clearStageTimers();
      setStage("idle");
      const message =
        err instanceof Error && err.message.includes("Failed to fetch")
          ? "You seem to be offline. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";

      trackEvent("deck_generation_failed", {
        mode: isTopic ? "topic" : "notes",
        reason: message.slice(0, 200),
      });

      setError(message);
    }
  }, [
    value,
    attachedText,
    fileName,
    examTrack,
    user,
    profile,
    router,
    refresh,
    clearStageTimers,
  ]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter starts. Shift+Enter is a newline, so pasting multi-line notes
    // still works.
    // isComposing: an input method (Japanese, Chinese, Korean...) uses Enter
    // to confirm a character, and that must not submit a half-typed topic.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void start();
    }
  };

  /* ----------------------------------------------------------------- view */

  if (isBusy || stage === "done") {
    return (
      <div
        className="card rise flex items-center gap-3 px-5 py-6"
        role="status"
        aria-live="polite"
      >
        <span
          className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--brand)", borderRightColor: "var(--brand)" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            {STAGE_LABEL[stage]}…
          </p>
          <p className="t-meta truncate">
            {fileName ||
              "Usually under a minute. Every question is checked before you see it."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className="card overflow-hidden transition-colors"
        style={{
          borderColor: isDragging ? "var(--brand-line)" : undefined,
          background: isDragging ? "var(--brand-soft)" : undefined,
        }}
      >
        <label htmlFor="composer-input" className="visually-hidden">
          What are you studying?
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            fileName
              ? "Anything specific to focus on? (optional)"
              : placeholder
          }
          className="w-full resize-none bg-transparent px-4 pt-4 text-[16px] leading-relaxed outline-none sm:px-5 sm:pt-5"
          style={{ color: "var(--text-1)" }}
        />

        {fileName && (
          <div className="px-4 pb-1 sm:px-5">
            <span className="chip">
              {fileName}
              <button
                type="button"
                onClick={() => {
                  setFileName(null);
                  setAttachedText("");
                }}
                aria-label={`Remove ${fileName}`}
                className="ml-0.5 opacity-70 hover:opacity-100"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 pb-3 pt-2 sm:px-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={onPickFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-quiet btn-sm"
            title="Attach a PDF, Word or PowerPoint file, a photo, or a text file"
          >
            <PaperclipIcon className="h-[17px] w-[17px]" />
            Attach
          </button>

          <button
            type="button"
            onClick={() => void start()}
            className="btn btn-primary ml-auto"
            disabled={!value.trim() && !attachedText.trim()}
          >
            Start studying
            <ArrowRightIcon className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>

      {capReached && (
        <div
          role="status"
          className="mt-3 rounded-[var(--radius-md)] border p-4"
          style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
        >
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            {capReached}
          </p>
          <p className="t-meta mt-1">
            Everything you&rsquo;ve made stays where it is, and practice is
            still unlimited. Pro removes the cap.
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Link
              href="/pricing"
              onClick={() => void trackEvent("upgrade_prompt_clicked", { source: "composer_cap" })}
              className="btn btn-primary btn-sm"
            >
              See Ace Pro
            </Link>
            <Link href="/library" className="btn btn-quiet btn-sm">
              Study what I have
            </Link>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[14px]"
          style={{
            borderColor: "rgb(248 113 113 / 0.3)",
            background: "var(--bad-soft)",
            color: "var(--bad)",
          }}
        >
          {error}
        </p>
      )}

      {suggestions && suggestions.length > 0 && !value.trim() && !fileName && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setValue(suggestion);
                textareaRef.current?.focus();
              }}
              className="chip transition-colors hover:bg-[var(--panel-hover)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
