"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/useAuth";

const GENERATION_STEPS = [
  "Reading notes",
  "Creating questions",
  "Saving battle",
  "Preparing arena",
];

const COURSE_OPTIONS = [
  "SAT Reading & Writing",
  "SAT Math",
  "AP Human Geography",
  "AP World History",
  "AP U.S. History",
  "AP Biology",
  "AP Chemistry",
  "AP Physics",
  "Algebra 1",
  "Algebra 2",
  "Geometry",
  "Precalculus",
  "Calculus",
  "English",
  "Biology",
  "Chemistry",
  "Physics",
  "World History",
  "U.S. History",
  "Computer Science",
  "Java Programming",
  "Python Programming",
  "Economics",
  "Psychology",
  "Government",
  "Other",
];

const GRADE_LEVEL_OPTIONS = [
  "Elementary (K-5)",
  "Middle School (6-8)",
  "High School (9-12)",
  "AP / Advanced",
  "College / University",
  "Other",
];

const DIFFICULTY_OPTIONS = [
  { value: "mixed", label: "Mixed (Recommended)" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 25];

const QUESTION_TYPE_OPTIONS = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
];

const DECK_TITLE_EXAMPLES = [
  "Cell Biology Unit 2",
  "SAT Grammar Practice",
  "AP Human Geography Urban Models",
];

const MIN_NOTES_CHARACTERS = 300;
const LONG_NOTES_CHARACTERS = 15000;
const LAST_COURSE_STORAGE_KEY = "studyclash_last_course";
const BETA_ACCESS_CODE_STORAGE_KEY = "studyclash_beta_access_code";

function getPreferredDisplayName(profile: Profile | null, user: User | null): string {
  const profileName = profile?.display_name?.trim();
  if (profileName) return profileName;

  const emailName = user?.email?.split("@")[0]?.trim();
  if (emailName) return emailName;

  return "";
}

// Defined OUTSIDE the page component (module scope), NOT inside CreateDeck.
// Keeping it here means it has a stable identity across re-renders — if it
// were declared inside CreateDeck, every keystroke would recreate this
// function, causing React to remount everything under it, including the
// form inputs (the classic "typing loses focus after one letter" bug).
function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10 sm:px-6 sm:py-20">
        {children}
      </div>
    </main>
  );
}

// Small section header with a numbered step badge. Also module-level, not
// defined inside CreateDeck, for the same reason as Background above.
function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 sm:mb-4">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-xs font-bold text-white">
        {step}
      </span>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white/70 sm:text-base">
        {title}
      </h2>
    </div>
  );
}

// Reads a File object's contents as plain text. Used for .txt uploads,
// both single-file and folder-based multi-file uploads.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}.`));
    };
    reader.readAsText(file);
  });
}

function getGenerationErrorMessage(status: number, fallback?: string): string {
  if (fallback?.trim()) {
    return fallback;
  }

  if (status === 401) {
    return "Your session expired. Please log in again and retry.";
  }

  if (status === 429) {
    return "You have reached your daily generation limit for now.";
  }

  if (status === 403) {
    return "Invalid beta access code. Please check your code and try again.";
  }

  if (status === 422) {
    return "We couldn't generate a solid battle from these notes yet. Try adding more detail or clearer structure.";
  }

  return "Something went wrong. Please try again.";
}

export default function CreateDeck() {
  const router = useRouter();
  const { user, profile, isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [studentName, setStudentName] = useState("");
  const [isEditingStudentName, setIsEditingStudentName] = useState(false);
  const [courseOption, setCourseOption] = useState("");
  const [customCourse, setCustomCourse] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [betaAccessCode, setBetaAccessCode] = useState("");

  // Guided generation fields. None of these are stored on the deck itself —
  // they only shape the OpenAI prompt and validation at generation time.
  const [topicFocus, setTopicFocus] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [difficultyMode, setDifficultyMode] = useState("mixed");
  const [questionCount, setQuestionCount] = useState("15");
  const [questionType, setQuestionType] = useState("multiple_choice");

  // Tracks which step of the loading sequence to visually highlight.
  // This is a cosmetic progress indicator — the actual work still
  // happens in one single API call, same as before.
  const [currentStep, setCurrentStep] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Regular file upload (single PDF or .txt, via click or drag-and-drop)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(
    null
  );
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Folder upload support varies a lot by browser. We feature-detect on
  // mount rather than assuming, and hide the control entirely if it's
  // unlikely to work well.
  const [supportsFolderUpload, setSupportsFolderUpload] = useState(false);

  // Ensures the "deck_create_opened" event only fires once per visit to
  // this page, not every time isLoggedIn re-evaluates.
  const hasTrackedOpenRef = useRef(false);

  // Clean up the step interval if the component unmounts mid-generation
  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
      }
    };
  }, []);

  // Redirect logged-out users to /login immediately once auth state has
  // finished resolving. redirect=/create lets the login page send them
  // back here after they log in.
  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push("/login?redirect=/create");
    }
  }, [isAuthLoading, isLoggedIn, router]);

  // Track that a logged-in user actually reached the create form.
  useEffect(() => {
    if (!isAuthLoading && isLoggedIn && !hasTrackedOpenRef.current) {
      hasTrackedOpenRef.current = true;
      trackEvent("deck_create_opened");
    }
  }, [isAuthLoading, isLoggedIn]);

  // Preselect the user's last chosen course, if any. Notes are
  // intentionally never saved to localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_COURSE_STORAGE_KEY);
      if (saved && COURSE_OPTIONS.includes(saved)) {
        void Promise.resolve().then(() => setCourseOption(saved));
      }

      const savedBetaCode = window.localStorage.getItem(
        BETA_ACCESS_CODE_STORAGE_KEY
      );
      if (savedBetaCode) {
        void Promise.resolve().then(() => setBetaAccessCode(savedBetaCode));
      }
    } catch {
      // localStorage can be unavailable (e.g. private browsing) — fine to
      // just skip preselection in that case.
    }
  }, []);

  // Feature-detect folder upload support. webkitdirectory works reliably in
  // Chromium-based browsers (Chrome, Edge). Support elsewhere is spotty, so
  // we only show the control where it's likely to actually work.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const isChromiumBased = /Chrome|Chromium|Edg\//.test(ua);
    void Promise.resolve().then(() => setSupportsFolderUpload(isChromiumBased));
  }, []);

  const stopGenerationSteps = () => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  };

  const handleCourseChange = (value: string) => {
    setCourseOption(value);
    if (value !== "Other") {
      setCustomCourse("");
    }
    try {
      window.localStorage.setItem(LAST_COURSE_STORAGE_KEY, value);
    } catch {
      // Non-critical if this fails.
    }
  };

  // Handles a single regular upload (PDF or .txt), from either the file
  // input or a drag-and-drop. Always REPLACES the notes textarea content,
  // never appends.
  const processRegularFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploadError(null);
    setUploadedFileName(null);
    setErrorMessage(null);

    if (fileList.length > 1) {
      setUploadError(
        "Please upload one file at a time here. Use \u201cUpload Folder\u201d below to combine multiple .txt files."
      );
      return;
    }

    const file = fileList[0];
    const lowerName = file.name.toLowerCase();

    if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".txt")) {
      setUploadError("Please upload a PDF or .txt file.");
      return;
    }

    setIsProcessingUpload(true);

    try {
      if (lowerName.endsWith(".pdf")) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/extract-pdf", {
          method: "POST",
          body: formData,
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          setUploadError(
            `Server error (status ${response.status}). Please try again.`
          );
          setIsProcessingUpload(false);
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          setUploadError(data.error || "Failed to extract text from this PDF.");
          return;
        }

        const extractedText = typeof data.text === "string" ? data.text.trim() : "";
        if (!extractedText) {
          setUploadError("We couldn't extract any usable text from this PDF.");
          return;
        }

        setNotes(extractedText);
      } else {
        const text = (await readFileAsText(file)).trim();
        if (!text) {
          setUploadError("That text file is empty.");
          return;
        }

        setNotes(text);
      }

      setUploadedFileName(file.name);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to process this file."
      );
    } finally {
      setIsProcessingUpload(false);
    }
  };

  // Handles a folder selection: combines every .txt file found into one
  // notes block, separated by clear file-name headers. Non-.txt files
  // (images, PDFs, etc.) inside the folder are silently ignored, per spec.
  const processFolderFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploadError(null);
    setUploadedFileName(null);
    setErrorMessage(null);

    const txtFiles = Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith(".txt")
    );

    if (txtFiles.length === 0) {
      setUploadError(
        "No .txt files were found in that folder. Folder upload only supports .txt files."
      );
      return;
    }

    setIsProcessingUpload(true);

    try {
      const sections = await Promise.all(
        txtFiles.map(async (f) => {
          const text = await readFileAsText(f);
          const label = (f as File & { webkitRelativePath?: string })
            .webkitRelativePath || f.name;
          return `----- ${label} -----\n\n${text.trim()}`;
        })
      );

      const combinedText = sections.join("\n\n\n").trim();
      if (!combinedText) {
        setUploadError("Those text files were empty.");
        return;
      }

      setNotes(combinedText);
      setUploadedFileName(
        `${txtFiles.length} .txt file${txtFiles.length > 1 ? "s" : ""} from folder`
      );
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "Failed to read files from that folder."
      );
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processRegularFiles(e.target.files);
    e.target.value = "";
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFolderFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    processRegularFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleRemoveUpload = () => {
    setUploadedFileName(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isGenerating || isProcessingUpload) {
      return;
    }

    setErrorMessage(null);

    const resolvedCourseName =
      courseOption === "Other" ? customCourse.trim() : courseOption;

    if (!resolvedStudentName) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!courseOption) {
      setErrorMessage("Please choose a subject.");
      return;
    }

    if (courseOption === "Other" && !customCourse.trim()) {
      setErrorMessage("Please enter your subject name.");
      return;
    }

    if (!deckTitle.trim()) {
      setErrorMessage("Please give your deck a title.");
      return;
    }

    if (notes.trim().length < MIN_NOTES_CHARACTERS) {
      setErrorMessage(
        `Please add at least ${MIN_NOTES_CHARACTERS} characters of notes so we can generate quality questions.`
      );
      return;
    }

    if (!betaAccessCode.trim()) {
      setErrorMessage("Please enter your beta access code.");
      return;
    }

    try {
      window.localStorage.setItem(
        BETA_ACCESS_CODE_STORAGE_KEY,
        betaAccessCode.trim()
      );
    } catch {
      // Non-critical if this fails.
    }

    setIsGenerating(true);
    setCurrentStep(0);

    trackEvent("deck_generation_started", {
      deckTitle,
      courseName: resolvedCourseName,
      notesCharacterCount: notes.trim().length,
      usedFileUpload: !!uploadedFileName,
      topicFocus: topicFocus.trim() || null,
      gradeLevel: gradeLevel || null,
      difficultyMode,
      questionCount: Number(questionCount),
      questionType,
    });

    // Advance through the visual steps on a timer while the real request
    // is in flight. It stops one step before the end so it never claims
    // "Preparing arena" is done before the API call actually finishes.
    stopGenerationSteps();
    stepIntervalRef.current = setInterval(() => {
      setCurrentStep((prev) =>
        prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 1400);

    try {
      // authFetch automatically attaches the logged-in user's session
      // token as an Authorization header, which the API route requires.
      const response = await authFetch("/api/generate-questions", {
        method: "POST",
        body: JSON.stringify({
          studentName: resolvedStudentName,
          courseName: resolvedCourseName,
          deckTitle,
          notes,
          topicFocus: topicFocus.trim() || undefined,
          gradeLevel: gradeLevel || undefined,
          difficulty: difficultyMode,
          questionCount: Number(questionCount),
          questionType,
          betaAccessCode: betaAccessCode.trim(),
        }),
      });

      // Check the content-type BEFORE trying to parse as JSON.
      // If the server errored (500, 404, etc.) it may return an HTML
      // error page instead of JSON, and calling response.json() on
      // that would throw "Unexpected token '<'".
      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        stopGenerationSteps();
        setErrorMessage(
          `Server error (status ${response.status}). Please try again.`
        );
        setIsGenerating(false);
        trackEvent("deck_generation_failed", {
          reason: "non_json_response",
          status: response.status,
        });
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        stopGenerationSteps();
        setErrorMessage(getGenerationErrorMessage(response.status, data.error));
        setIsGenerating(false);
        trackEvent("deck_generation_failed", {
          reason: data.error || "unknown_error",
          status: response.status,
        });
        return;
      }

      const deckId = data?.deckId;
      if (!deckId || (typeof deckId !== "string" && typeof deckId !== "number")) {
        stopGenerationSteps();
        setErrorMessage("Your deck was generated, but we couldn't open it automatically. Please try again.");
        setIsGenerating(false);
        trackEvent("deck_generation_failed", {
          reason: "missing_deck_id",
          status: response.status,
        });
        return;
      }

      // Success — snap to the final step briefly so the user sees
      // "Preparing arena" complete before the redirect happens.
      stopGenerationSteps();
      setCurrentStep(GENERATION_STEPS.length - 1);

      trackEvent("deck_generation_success", {
        deckId,
        deckTitle,
        courseName: resolvedCourseName,
      });

      setTimeout(() => {
        router.push(`/battle/${deckId}`);
      }, 500);
    } catch (err) {
      stopGenerationSteps();
      setErrorMessage(
        err instanceof Error && err.message.includes("Failed to fetch")
          ? "Network error. Check your connection and try again."
          : "Something went wrong. Please try again."
      );
      setIsGenerating(false);
      trackEvent("deck_generation_failed", {
        reason: "client_exception",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  };

  const notesCharCount = notes.length;
  const isNotesShort = notes.length > 0 && notes.trim().length < MIN_NOTES_CHARACTERS;
  const isNotesLong = notes.trim().length > LONG_NOTES_CHARACTERS;
  const accountDisplayName = getPreferredDisplayName(profile, user);
  const resolvedStudentName = studentName.trim() || accountDisplayName;

  // ---------- Auth loading OR redirecting state ----------
  if (isAuthLoading || !isLoggedIn) {
    return (
      <Background>
        <svg
          className="h-10 w-10 animate-spin text-fuchsia-400"
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
        <p className="mt-4 text-sm text-white/50">Checking login...</p>
      </Background>
    );
  }

  // ---------- Logged in: full create form ----------
  return (
    <Background>
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
        Pick your subject, tell us how you want it built, and we&apos;ll turn
        your notes into a quick practice round.
      </p>

      <div className="mt-5 w-full max-w-2xl rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] px-4 py-3 text-sm text-cyan-100/90 backdrop-blur-sm sm:px-5">
        Fastest path: choose your subject, name the deck, paste or upload your notes, and keep the defaults unless you want to fine-tune the battle.
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-10 sm:p-6 md:p-8"
      >
        {/* ---------- Section 1: Choose Subject ---------- */}
        <SectionHeader step={1} title="Choose Subject" />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="courseOption"
            className="text-xs font-bold uppercase tracking-wider text-white/60"
          >
            Subject
          </label>
          <select
            id="courseOption"
            value={courseOption}
            onChange={(e) => handleCourseChange(e.target.value)}
            required
            className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
          >
            <option value="" disabled>
              Select a subject...
            </option>
            {COURSE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {courseOption === "Other" && (
          <div className="mt-3 flex flex-col gap-2">
            <label
              htmlFor="customCourse"
              className="text-xs font-bold uppercase tracking-wider text-white/60"
            >
              Subject Name
            </label>
            <input
              id="customCourse"
              type="text"
              value={customCourse}
              onChange={(e) => setCustomCourse(e.target.value)}
              placeholder="e.g. Organic Chemistry II"
              required
              className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
            />
          </div>
        )}

        {/* ---------- Section 2: Name Your Deck ---------- */}
        <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
          <SectionHeader step={2} title="Name Your Deck" />

          <div className="grid grid-cols-1 gap-4 sm:gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="studentName"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Your Name
              </label>

              {accountDisplayName && !isEditingStudentName ? (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/90">
                        Using your account name: {accountDisplayName}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        You don&apos;t need to type it again unless you want a different display name on this deck.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStudentName(accountDisplayName);
                        setIsEditingStudentName(true);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/85 transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10"
                    >
                      Edit Name
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    id="studentName"
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder={accountDisplayName || "e.g. Jordan Lee"}
                    required={!accountDisplayName}
                    autoFocus={isEditingStudentName}
                    className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/35">
                    <span>
                      {accountDisplayName
                        ? "Change it here if you want a different name on this deck."
                        : "This name appears on the deck and battle results."}
                    </span>
                    {accountDisplayName && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentName("");
                          setIsEditingStudentName(false);
                        }}
                        className="font-bold text-cyan-300 transition-colors duration-150 hover:text-cyan-200"
                      >
                        Use account name instead
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
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
                placeholder={`e.g. ${DECK_TITLE_EXAMPLES[0]}`}
                required
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              />
              <p className="text-[11px] text-white/30">
                Make it short and specific so it&apos;s easy to find later. Other ideas: {DECK_TITLE_EXAMPLES.slice(1).join(" · ")}
              </p>
            </div>
          </div>
        </div>

        {/* ---------- Section 3: Customize Your Battle ---------- */}
        <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
          <SectionHeader step={3} title="Customize Your Battle" />
          <p className="-mt-1 mb-4 text-xs text-white/40">
            Optional — pick what fits, or leave the defaults as-is.
          </p>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="topicFocus"
              className="text-xs font-bold uppercase tracking-wider text-white/60"
            >
              Topic Focus (optional)
            </label>
            <input
              id="topicFocus"
              type="text"
              value={topicFocus}
              onChange={(e) => setTopicFocus(e.target.value)}
              placeholder="e.g. Cell structure and function — leave blank to cover everything in your notes"
              className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
            />
            <p className="text-[11px] text-white/30">
              Leave this blank if you want the battle to cover everything from your notes.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="gradeLevel"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Grade Level (optional)
              </label>
              <select
                id="gradeLevel"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              >
                <option value="">No preference</option>
                {GRADE_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="difficultyMode"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Difficulty
              </label>
              <select
                id="difficultyMode"
                value={difficultyMode}
                onChange={(e) => setDifficultyMode(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="questionCount"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Number of Questions
              </label>
              <select
                id="questionCount"
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              >
                {QUESTION_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} questions
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="questionType"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Question Type
              </label>
              <select
                id="questionType"
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
              >
                {QUESTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ---------- Section 4: Add Notes or Upload Files ---------- */}
        <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
          <SectionHeader step={4} title="Add Notes or Upload Files" />

          {/* Drag-and-drop upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 sm:py-8 ${
              isDragActive
                ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                : "border-white/15 bg-black/20"
            } ${isProcessingUpload ? "pointer-events-none opacity-60" : ""}`}
          >
            <svg
              className="h-7 w-7 flex-shrink-0 text-white/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-semibold text-white/70">
              Drag & drop a PDF or .txt file here
            </p>
            <p className="text-xs text-white/40">or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingUpload}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/90 transition-colors duration-150 hover:border-fuchsia-400/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt"
              onChange={handleFileInputChange}
              disabled={isProcessingUpload}
              className="hidden"
            />

            {supportsFolderUpload && (
              <>
                <div className="mt-1 h-px w-16 bg-white/10" />
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isProcessingUpload}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/40 transition-colors duration-150 hover:text-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60"
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
                      d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0v6a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25v-6m-19.5 0h19.5M4.5 9.75v-2.25a2.25 2.25 0 012.25-2.25h4.5l2.25 2.25h4.5a2.25 2.25 0 012.25 2.25v2.25"
                    />
                  </svg>
                  Upload Folder (.txt files)
                </button>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  onChange={handleFolderInputChange}
                  disabled={isProcessingUpload}
                  className="hidden"
                  {...({ webkitdirectory: "", directory: "" } as Record<
                    string,
                    string
                  >)}
                />
              </>
            )}

            {!supportsFolderUpload && (
              <p className="mt-1 text-[11px] text-white/25">
                Folder upload works best in Chrome/Edge.
              </p>
            )}
          </div>

          <p className="mt-3 text-[11px] text-white/30">
            Tip: chapter summaries, study guides, and well-organized class notes usually generate the best questions.
          </p>

          {/* Upload status / errors */}
          {isProcessingUpload && (
            <div className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
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
              Processing your file...
            </div>
          )}

          {!isProcessingUpload && uploadedFileName && !uploadError && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3.5 py-2.5">
              <span className="truncate text-xs font-semibold text-emerald-300">
                ✅ Loaded: {uploadedFileName}
              </span>
              <button
                type="button"
                onClick={handleRemoveUpload}
                className="flex-shrink-0 text-xs font-bold text-white/50 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          )}

          {uploadError && (
            <p className="mt-3 text-xs text-red-300">{uploadError}</p>
          )}

          {/* Notes textarea */}
          <div className="mt-5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="notes"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Notes / Study Guide
              </label>
              <span className="flex-shrink-0 text-xs text-white/30">
                {notesCharCount} characters
              </span>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (uploadError) {
                  setUploadError(null);
                }
                if (errorMessage) {
                  setErrorMessage(null);
                }
              }}
              placeholder="Paste your class notes, study guide, textbook section, or review sheet here..."
              required
              rows={10}
              className="w-full min-w-0 resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base leading-relaxed text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:rows-12 sm:text-sm"
            />

            {isNotesShort && (
              <p className="text-xs text-amber-300">
                Add more notes for better questions.
              </p>
            )}
            {isNotesLong && (
              <p className="text-xs text-amber-300">
                Your notes are quite long — generation may take a little
                longer and will focus on the most important sections.
              </p>
            )}
          </div>
        </div>

        {/* ---------- Section 5: Generate Battle ---------- */}
        <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
          <SectionHeader step={5} title="Generate Battle" />

          <div className="mb-4 flex flex-col gap-2">
            <label
              htmlFor="betaAccessCode"
              className="text-xs font-bold uppercase tracking-wider text-white/60"
            >
              Beta Access Code
            </label>
            <input
              id="betaAccessCode"
              type="text"
              value={betaAccessCode}
              onChange={(e) => setBetaAccessCode(e.target.value)}
              placeholder="Enter your beta access code"
              required
              autoComplete="off"
              className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:py-3 sm:text-sm"
            />
            <p className="text-[9px] text-white/30">
              Your beta access code was sent to you by the owner if you wanted to try this app.
            </p>
          </div>

          <button
            type="submit"
            disabled={isGenerating || isProcessingUpload}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:px-8 sm:hover:scale-[1.02] sm:text-lg"
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
        </div>
      </form>

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
    </Background>
  );
}