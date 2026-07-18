"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type DocumentRow = {
  id: string;
  title: string;
  source_type: string;
  processing_status: string;
  page_count: number | null;
  extraction_confidence: number | null;
  created_at: string;
};

type ConceptRow = {
  id: string;
  parent_concept_id: string | null;
  concept_level: string;
  name: string;
  importance: string | null;
  difficulty: string | null;
  estimated_learning_minutes: number | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  question_type: string;
  explanation: string;
  difficulty: number;
  status: string;
  correct_answer: string | null;
};

type ProgressResponse = {
  course: { id: string; name: string; subject: string | null };
  documents: DocumentRow[];
  documentStats: { total: number; byStatus: Record<string, number>; totalPages: number; needingReview: number };
  concepts: ConceptRow[];
  coverage: { total_concepts: number; concepts_covered: number; overall_coverage_percent: number; computed_at: string } | null;
  questionStats: { total: number; byStatus: Record<string, number> };
  activeJobs: number;
};

const CONCEPT_LEVEL_ORDER = ["unit", "chapter", "topic", "concept", "skill", "subskill", "learning_objective", "assessment_objective"];
const CONCEPT_LEVEL_LABELS: Record<string, string> = {
  unit: "Units",
  chapter: "Chapters",
  topic: "Topics",
  concept: "Concepts",
  skill: "Skills",
  subskill: "Subskills",
  learning_objective: "Learning objectives",
  assessment_objective: "Assessment objectives",
};

const STATUS_TONE: Record<string, string> = {
  ready: "border-green-400/30 bg-green-500/10 text-green-200",
  uploaded: "border-white/15 bg-white/5 text-white/60",
  extracting: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  chunking: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  indexing: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  mapping: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  generating: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  verifying: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  failed: "border-red-400/30 bg-red-500/10 text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || "border-white/15 bg-white/5 text-white/60";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function CourseProgressPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = String(params.courseId || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [data, setData] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedConceptId, setExpandedConceptId] = useState<string | null>(null);
  const [conceptQuestions, setConceptQuestions] = useState<Record<string, QuestionRow[] | "loading" | "error">>({});
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await authFetch(`/api/curriculum/courses/${courseId}/progress`);
      const json = await response.json();
      if (!response.ok) {
        setLoadError(json.error || "Could not load this course.");
        return;
      }
      setData(json as ProgressResponse);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this course.");
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isLoggedIn) {
      router.push(`/login?redirect=/curriculum/${courseId}`);
      return;
    }
    if (!courseId) return;
    void trackEvent("page_view", { page: "curriculum_course_progress", courseId });
    void fetchProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isLoggedIn, courseId]);

  // Live progress while the pipeline is actively working on this course --
  // the whole point of this page (Section 10: "1,842 pages uploaded / 1,799
  // processed" as a number that visibly moves), not a static snapshot.
  useEffect(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (data && data.activeJobs > 0) {
      pollTimerRef.current = setTimeout(() => void fetchProgress(), 6000);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [data, fetchProgress]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Choose a file first.");
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("courseId", courseId);
      const response = await authFetch("/api/curriculum/documents", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) {
        setUploadError(json.error || "Upload failed.");
        setIsUploading(false);
        return;
      }
      void trackEvent("curriculum_document_uploaded", { courseId, documentId: json.document?.id });
      setUploadFile(null);
      setIsUploading(false);
      void fetchProgress();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
      setIsUploading(false);
    }
  };

  const toggleConcept = async (conceptId: string) => {
    if (expandedConceptId === conceptId) {
      setExpandedConceptId(null);
      return;
    }
    setExpandedConceptId(conceptId);
    if (conceptQuestions[conceptId]) return;
    setConceptQuestions((prev) => ({ ...prev, [conceptId]: "loading" }));
    try {
      const response = await authFetch(`/api/curriculum/courses/${courseId}/concepts/${conceptId}/questions`);
      const json = await response.json();
      if (!response.ok) {
        setConceptQuestions((prev) => ({ ...prev, [conceptId]: "error" }));
        return;
      }
      setConceptQuestions((prev) => ({ ...prev, [conceptId]: json.questions as QuestionRow[] }));
    } catch {
      setConceptQuestions((prev) => ({ ...prev, [conceptId]: "error" }));
    }
  };

  if (isAuthLoading || (isLoading && !data)) {
    return (
      <Background>
        <p className="text-sm text-white/50">Loading course...</p>
      </Background>
    );
  }

  if (loadError && !data) {
    return (
      <Background>
        <p className="text-sm text-red-300">{loadError}</p>
        <Link href="/curriculum" className="mt-4 w-fit text-sm font-semibold text-indigo-300">
          &larr; Back to courses
        </Link>
      </Background>
    );
  }

  if (!data) return null;

  const conceptsByLevel = new Map<string, ConceptRow[]>();
  for (const c of data.concepts) {
    if (!conceptsByLevel.has(c.concept_level)) conceptsByLevel.set(c.concept_level, []);
    conceptsByLevel.get(c.concept_level)!.push(c);
  }
  const conceptNameById = new Map(data.concepts.map((c) => [c.id, c.name]));

  const pagesReady = data.documents
    .filter((d) => d.processing_status === "ready")
    .reduce((sum, d) => sum + (d.page_count || 0), 0);

  return (
    <Background>
      <Link href="/curriculum" className="w-fit text-sm font-semibold text-indigo-300">
        &larr; Back to courses
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
              {data.course.name}
            </span>
          </h1>
          {data.course.subject && <p className="mt-1 text-sm text-white/50">{data.course.subject}</p>}
        </div>
        {data.activeJobs > 0 && (
          <span className="flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" />
            Processing &middot; {data.activeJobs} job{data.activeJobs === 1 ? "" : "s"} running
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-2xl font-black text-white">
            {pagesReady.toLocaleString()} / {data.documentStats.totalPages.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-white/50">pages processed</p>
          {data.documentStats.needingReview > 0 && (
            <p className="mt-1 text-[11px] text-amber-300">{data.documentStats.needingReview} document(s) need review</p>
          )}
        </Card>
        <Card padding="sm">
          <p className="text-2xl font-black text-white">
            {data.coverage ? `${data.coverage.overall_coverage_percent}%` : "--"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {data.coverage ? `${data.coverage.concepts_covered} / ${data.coverage.total_concepts} concepts covered` : "Coverage not computed yet"}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-2xl font-black text-white">{data.questionStats.byStatus.approved || 0}</p>
          <p className="mt-1 text-xs text-white/50">
            questions approved &middot; {data.questionStats.total} generated total
          </p>
        </Card>
      </div>

      <Card padding="md" className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">Upload a document</p>
        <form onSubmit={handleUpload} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".pdf,.txt,image/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="flex-1 text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-200"
          />
          <Button type="submit" isLoading={isUploading} disabled={!uploadFile} className="sm:w-auto">
            Upload
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-white/35">PDF, image, or plain text. Up to 25MB. Word/PowerPoint: export to PDF for now.</p>
        {uploadError && <p className="mt-2 text-xs text-red-300">{uploadError}</p>}
      </Card>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-white/50">Documents</p>
        {data.documents.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No documents uploaded yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {data.documents.map((doc) => (
              <Card key={doc.id} padding="sm" className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{doc.title}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {doc.source_type} {doc.page_count ? `· ${doc.page_count} pages` : ""}
                  </p>
                </div>
                <StatusBadge status={doc.processing_status} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-white/50">Concept map</p>
        {data.concepts.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            No concepts mapped yet -- this fills in automatically once your documents finish processing.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-5">
            {CONCEPT_LEVEL_ORDER.filter((level) => conceptsByLevel.has(level)).map((level) => (
              <div key={level}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300/80">
                  {CONCEPT_LEVEL_LABELS[level]}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {conceptsByLevel.get(level)!.map((concept) => (
                    <div key={concept.id}>
                      <button
                        onClick={() => toggleConcept(concept.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-indigo-300/30"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{concept.name}</p>
                          {concept.parent_concept_id && conceptNameById.get(concept.parent_concept_id) && (
                            <p className="mt-0.5 truncate text-[11px] text-white/35">
                              under {conceptNameById.get(concept.parent_concept_id)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {concept.importance && (
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-white/50">
                              {concept.importance}
                            </span>
                          )}
                          <span className="text-white/30">{expandedConceptId === concept.id ? "−" : "+"}</span>
                        </div>
                      </button>

                      {expandedConceptId === concept.id && (
                        <div className="mt-2 ml-2 flex flex-col gap-2 border-l border-white/10 pl-4">
                          {conceptQuestions[concept.id] === "loading" && (
                            <p className="text-xs text-white/40">Loading questions...</p>
                          )}
                          {conceptQuestions[concept.id] === "error" && (
                            <p className="text-xs text-red-300">Could not load questions for this concept.</p>
                          )}
                          {Array.isArray(conceptQuestions[concept.id]) &&
                            (conceptQuestions[concept.id] as QuestionRow[]).length === 0 && (
                              <p className="text-xs text-white/40">No questions generated for this concept yet.</p>
                            )}
                          {Array.isArray(conceptQuestions[concept.id]) &&
                            (conceptQuestions[concept.id] as QuestionRow[]).map((q) => (
                              <div key={q.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm text-white/85">{q.question_text}</p>
                                  <StatusBadge status={q.status} />
                                </div>
                                {q.status === "approved" && (
                                  <p className="mt-2 text-xs text-white/50">
                                    <span className="font-semibold text-green-300">Answer:</span> {q.correct_answer}
                                  </p>
                                )}
                                {q.status === "approved" && (
                                  <p className="mt-1 text-xs text-white/40">{q.explanation}</p>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Background>
  );
}
