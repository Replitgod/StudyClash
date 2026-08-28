"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const MAX_PDF_BYTES = 8 * 1024 * 1024;
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
const ACCEPT = ".pdf,.txt,.md,.jpg,.jpeg,.png,.webp,.heic,.heif";

type Stage = "idle" | "reading" | "thinking" | "writing" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  reading: "Reading your material",
  thinking: "Understanding it",
  writing: "Writing your questions",
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
   * Optional exam track ("ap" | "sat" | "mcat" | "lsat" | "nclex"), set when
   * the student arrived from an exam page. It makes the generated questions
   * match that exam's style; the server ignores anything it does not know.
   */
  examTrack?: string | null;
};

export function Composer({
  placeholder = "What are you studying?",
  autoFocus = false,
  footer,
  examTrack = null,
}: ComposerProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { refresh } = useStudy();

  const [value, setValue] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // Text pulled out of an attachment. Kept separate from `value` so a
  // 40-page PDF does not dump 100,000 characters into the box the student
  // is typing in -- they see a file chip, not a wall of extracted text.
  const [attachedText, setAttachedText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
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
    const isPdf = lowerName.endsWith(".pdf");
    const isImage = IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const isText = lowerName.endsWith(".txt") || lowerName.endsWith(".md");

    if (!isPdf && !isImage && !isText) {
      setError(
        "That file type is not supported yet. Attach a PDF, a photo, or a .txt file — or paste the text in directly."
      );
      return;
    }

    const limit = isPdf ? MAX_PDF_BYTES : isImage ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
    if (file.size > limit) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB, which is over the ${(
          limit /
          1024 /
          1024
        ).toFixed(0)}MB limit. Try a smaller file, or paste the text in directly.`
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

      const response = await authFetch(isPdf ? "/api/extract-pdf" : "/api/extract-image", {
        method: "POST",
        body: formData,
      });

      // A 500 can come back as an HTML error page; parsing that as JSON
      // throws an unhelpful "Unexpected token <".
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`We could not read that file (server error ${response.status}).`);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not read that file.");
      }

      const text = String(data.text || "").trim();
      if (!text) {
        throw new Error(
          "We could not find any readable text in that file. If it is a scan, try a clearer photo, or paste the text in directly."
        );
      }

      setAttachedText(text.slice(0, MAX_NOTES_CHARACTERS));
      setStage("idle");
    } catch (err) {
      setFileName(null);
      setAttachedText("");
      setStage("idle");
      setError(
        err instanceof Error ? err.message : "We could not read that file. Please try another."
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
    clearStageTimers();
    setStage(isTopic ? "thinking" : "writing");

    // Move the label forward while the single request is in flight so the
    // wait reads as progress rather than a frozen screen. It never claims
    // the last step is done -- the redirect does that.
    if (isTopic) {
      stageTimersRef.current.push(setTimeout(() => setStage("writing"), 3500));
    }

    try {
      const response = await authFetch("/api/generate-questions", {
        method: "POST",
        body: JSON.stringify({
          studentName: profile?.display_name || user.email?.split("@")[0] || "Student",
          courseName: "My Study",
          deckTitle: title,
          notes: material,
          topicFocus: attachedText && typed ? typed.slice(0, 200) : undefined,
          sourceMode: isTopic ? "topic" : "notes",
          examTrack: examTrack || undefined,
          uploadKind: fileName
            ? fileName.toLowerCase().endsWith(".pdf")
              ? "pdf"
              : IMAGE_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))
                ? "image"
                : "text"
            : "manual",
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Something went wrong (server error ${response.status}). Please try again.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "We could not create your study material. Please try again.");
      }

      const deckId = data?.deckId;
      if (!deckId) {
        throw new Error("Your material was created but we could not open it. Check your Library.");
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
      setError(
        err instanceof Error && err.message.includes("Failed to fetch")
          ? "Network error. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
      );
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
    if (event.key === "Enter" && !event.shiftKey) {
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
            {fileName || "This usually takes about 20 seconds."}
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
            title="Attach a PDF, photo, or text file"
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

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
