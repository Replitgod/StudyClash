"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateDeck() {
  const router = useRouter();

  const [studentName, setStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentName || !courseName || !deckTitle || !notes) return;

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName,
          courseName,
          deckTitle,
          notes,
        }),
      });

      // Check the content-type BEFORE trying to parse as JSON.
      // If the server errored (500, 404, etc.) it may return an HTML
      // error page instead of JSON, and calling response.json() on
      // that would throw "Unexpected token '<'".
      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response from server:", text);
        setErrorMessage(
          `Server error (status ${response.status}). Please try again.`
        );
        setIsGenerating(false);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || "Something went wrong.");
        setIsGenerating(false);
        return;
      }

      router.push(`/battle/${data.deckId}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setIsGenerating(false);
    }
  };

  const notesWordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center px-6 py-16 sm:py-20">
        {/* Badge */}
        <div className="mb-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          NEW DECK
        </div>

        {/* Title */}
        <h1 className="text-center text-4xl font-black tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Build Your Battle
          </span>
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-white/50 sm:text-base">
          Drop in your notes and we&apos;ll turn them into a 90-second quiz
          battle.
        </p>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="mt-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Student name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="studentName"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Your Name
              </label>
              <input
                id="studentName"
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Jordan Lee"
                required
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20"
              />
            </div>

            {/* Course name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="courseName"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Course Name
              </label>
              <input
                id="courseName"
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. Organic Chemistry II"
                required
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20"
              />
            </div>
          </div>

          {/* Deck title */}
          <div className="mt-5 flex flex-col gap-2">
            <label
              htmlFor="deckTitle"
              className="text-xs font-bold uppercase tracking-wider text-white/60"
            >
              Deck Title
            </label>
            <input
              id="deckTitle"
              type="text"
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
              placeholder="e.g. Midterm 2: Reaction Mechanisms"
              required
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20"
            />
          </div>

          {/* Notes textarea */}
          <div className="mt-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="notes"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Notes / Study Guide
              </label>
              <span className="text-xs text-white/30">
                {notesWordCount} words
              </span>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste your notes, slides content, or study guide here..."
              required
              rows={12}
              className="resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20"
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isGenerating}
            className="group relative mt-8 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:text-lg"
          >
            {isGenerating ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <span className="relative z-10">Generating Battle...</span>
              </>
            ) : (
              <>
                <span className="relative z-10">Generate Battle Deck</span>
                <svg
                  className="relative z-10 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </>
            )}
            {!isGenerating && (
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            )}
          </button>

          {/* Error message */}
          {errorMessage && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              {errorMessage}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}