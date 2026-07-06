"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const GENERATION_STEPS = [
  "Reading notes",
  "Creating questions",
  "Saving battle",
  "Preparing arena",
];

export default function CreateDeck() {
  const router = useRouter();

  const [studentName, setStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tracks which step of the loading sequence to visually highlight.
  // This is a cosmetic progress indicator — the actual work still
  // happens in one single API call, same as before.
  const [currentStep, setCurrentStep] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // PDF upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(
    null
  );
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Clean up the step interval if the component unmounts mid-generation
  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
    };
  }, []);

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setPdfError(null);
    setIsExtractingPdf(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        setPdfError(`Server error (status ${response.status}). Please try again.`);
        setIsExtractingPdf(false);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setPdfError(data.error || "Failed to extract text from this PDF.");
        setIsExtractingPdf(false);
        return;
      }

      // Put the extracted text into the notes textarea. The user can
      // still edit it freely before generating the battle deck.
      setNotes(data.text);
      setIsExtractingPdf(false);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : "Failed to extract text from this PDF."
      );
      setIsExtractingPdf(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFileName(null);
    setPdfError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentName || !courseName || !deckTitle || !notes) return;

    // Explicit check so the user gets a clear, specific message instead
    // of just relying on the browser's native "required" validation.
    if (!betaCode.trim()) {
      setErrorMessage("Please enter your beta access code.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setCurrentStep(0);

    // Advance through the visual steps on a timer while the real request
    // is in flight. It stops one step before the end so it never claims
    // "Preparing arena" is done before the API call actually finishes.
    stepIntervalRef.current = setInterval(() => {
      setCurrentStep((prev) =>
        prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 1400);

    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName,
          courseName,
          deckTitle,
          notes,
          betaCode: betaCode.trim(),
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
        if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
        setErrorMessage(
          `Server error (status ${response.status}). Please try again.`
        );
        setIsGenerating(false);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
        setErrorMessage(data.error || "Something went wrong.");
        setIsGenerating(false);
        return;
      }

      // Success — snap to the final step briefly so the user sees
      // "Preparing arena" complete before the redirect happens.
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      setCurrentStep(GENERATION_STEPS.length - 1);

      setTimeout(() => {
        router.push(`/battle/${data.deckId}`);
      }, 500);
    } catch (err) {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setIsGenerating(false);
    }
  };

  const notesWordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
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

      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10 sm:px-6 sm:py-20">
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          NEW DECK
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
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
          className="mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-10 sm:p-6 md:p-8"
        >
          {/* Beta access code — placed first so it's the first thing a
              new visitor sees and can't miss it before filling everything
              else out. */}
          <div className="flex flex-col gap-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4">
            <label
              htmlFor="betaCode"
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-300"
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
              Beta Access Code
            </label>
            <input
              id="betaCode"
              type="text"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value)}
              placeholder="Enter your invite code"
              required
              autoComplete="off"
              className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
            />
            <p className="text-[11px] text-white/40">
              StudyClash is in private beta. Don&apos;t have a code? Ask
              whoever invited you.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:gap-5 md:grid-cols-2">
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
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
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
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              />
            </div>
          </div>

          {/* Deck title */}
          <div className="mt-4 flex flex-col gap-2 sm:mt-5">
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
              className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
            />
          </div>

          {/* PDF upload */}
          <div className="mt-4 flex flex-col gap-2 sm:mt-5">
            <label className="text-xs font-bold uppercase tracking-wider text-white/60">
              Upload PDF (optional)
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label
                htmlFor="pdfUpload"
                className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/30 px-4 py-3.5 text-sm text-white/60 transition-colors duration-150 hover:border-fuchsia-400/40 hover:bg-white/5 ${
                  isExtractingPdf ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <svg
                  className="h-5 w-5 flex-shrink-0 text-white/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="truncate">
                  {selectedFileName ? selectedFileName : "Choose a PDF file"}
                </span>
              </label>
              <input
                id="pdfUpload"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handlePdfSelected}
                disabled={isExtractingPdf}
                className="hidden"
              />

              {selectedFileName && (
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={isExtractingPdf}
                  className="flex-shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/60 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-3"
                >
                  Remove
                </button>
              )}
            </div>

            {isExtractingPdf && (
              <div className="flex items-center gap-2 text-xs text-cyan-300">
                <svg
                  className="h-4 w-4 flex-shrink-0 animate-spin"
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
                Extracting PDF...
              </div>
            )}

            {pdfError && (
              <p className="text-xs text-red-300">{pdfError}</p>
            )}
          </div>

          {/* Notes textarea */}
          <div className="mt-4 flex flex-col gap-2 sm:mt-5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="notes"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Notes / Study Guide
              </label>
              <span className="flex-shrink-0 text-xs text-white/30">
                {notesWordCount} words
              </span>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste your notes, slides content, or study guide here — or upload a PDF above and edit the extracted text."
              required
              rows={10}
              className="w-full min-w-0 resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base leading-relaxed text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:rows-12 sm:text-sm"
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isGenerating || isExtractingPdf}
            className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:mt-8 sm:px-8 sm:hover:scale-[1.02] sm:text-lg"
          >
            {isGenerating ? (
              <>
                <svg
                  className="h-5 w-5 flex-shrink-0 animate-spin"
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
                  className="relative z-10 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
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
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0"
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
              <span className="min-w-0 break-words">{errorMessage}</span>
            </div>
          )}
        </form>
      </div>

      {/* Generation loading overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05050a]/90 px-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_60px_-15px_rgba(217,70,239,0.4)] sm:p-8">
            {/* Spinning badge */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20">
              <svg
                className="h-7 w-7 animate-spin text-fuchsia-300"
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
            </div>

            <h2 className="mt-5 text-center text-lg font-black tracking-tight sm:text-xl">
              <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Building Your Battle
              </span>
            </h2>
            <p className="mt-1 text-center text-xs text-white/40">
              This usually takes about 10-20 seconds
            </p>

            {/* Step list */}
            <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:gap-3">
              {GENERATION_STEPS.map((step, index) => {
                const isComplete = index < currentStep;
                const isActive = index === currentStep;

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300 sm:px-4 ${
                      isActive
                        ? "border-fuchsia-400/40 bg-fuchsia-500/10"
                        : isComplete
                        ? "border-emerald-400/20 bg-emerald-500/5"
                        : "border-white/5 bg-black/20 opacity-40"
                    }`}
                  >
                    {/* Status icon */}
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                      {isComplete ? (
                        <span className="text-sm text-emerald-400">✅</span>
                      ) : isActive ? (
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-fuchsia-400" />
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-white/20" />
                      )}
                    </div>

                    <span
                      className={`text-sm font-semibold ${
                        isActive
                          ? "text-white"
                          : isComplete
                          ? "text-emerald-300"
                          : "text-white/40"
                      }`}
                    >
                      {step}
                      {isActive && (
                        <span className="ml-0.5 inline-block animate-pulse">
                          ...
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}