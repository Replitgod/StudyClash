"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabase";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

type Difficulty = "easy" | "medium" | "hard";
type QuestionType = "multiple_choice" | "student_produced_response";
type QuestionStatus = "draft" | "in_review" | "published" | "rejected" | "archived";

type ExamOption = { id: string; slug: string; name: string };

type BankQuestion = {
  id: string;
  exam_id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  stimulus: string | null;
  question_text: string;
  answer_choices: { id: string; text: string }[] | null;
  correct_answer: string;
  explanation: string;
  status: QuestionStatus;
  source_type: string;
  created_at: string;
};

const STATUS_TABS: QuestionStatus[] = ["draft", "in_review", "published", "rejected", "archived"];

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-10 pb-24 sm:px-6">
        {children}
      </div>
    </main>
  );
}

export default function AdminDiagnosticsPage() {
  const { isLoggedIn, isLoading } = useAuth();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [statusTab, setStatusTab] = useState<QuestionStatus>("in_review");
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    section: "reading_writing",
    domain: "",
    skill: "",
    difficulty: "medium" as Difficulty,
    questionType: "multiple_choice" as QuestionType,
    topicHint: "",
  });
  const [isDrafting, setIsDrafting] = useState(false);

  useEffect(() => {
    supabase
      .from("exam_definitions")
      .select("id, slug, name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        const list = (data || []) as ExamOption[];
        setExams(list);
        if (list.length > 0) setExamId((prev) => prev || list[0].id);
      });
  }, []);

  const loadQuestions = async () => {
    if (!examId) return;
    setIsLoadingQuestions(true);
    setAccessError(null);

    try {
      const response = await authFetch(
        `/api/admin/diagnostic-questions?status=${statusTab}&examId=${examId}`,
        { method: "GET" }
      );
      const json = await response.json();

      if (!response.ok) {
        setAccessError(json.error || "Failed to load questions.");
        setQuestions([]);
        return;
      }

      setQuestions(json.questions || []);
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Failed to load questions.");
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn && examId) {
      loadQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, examId, statusTab]);

  const handleDraft = async (withAi: boolean) => {
    if (!examId || !form.domain || !form.skill) {
      setActionError("Pick an exam and fill in domain + skill first.");
      return;
    }

    setIsDrafting(true);
    setActionError(null);

    try {
      const payload: Record<string, unknown> = {
        examId,
        section: form.section,
        domain: form.domain,
        skill: form.skill,
        difficulty: form.difficulty,
        questionType: form.questionType,
      };

      if (withAi) {
        payload.aiAssist = { topicHint: form.topicHint || undefined };
      } else {
        // Manual authoring opens a blank draft the reviewer edits inline
        // below -- keeps this page from needing a second full editor form.
        payload.questionText = "Untitled draft -- edit below before submitting for review.";
        payload.explanation = "Add an explanation before submitting for review.";
        payload.correctAnswer = form.questionType === "multiple_choice" ? "A" : "answer";
        payload.answerChoices =
          form.questionType === "multiple_choice"
            ? [
                { id: "A", text: "Choice A" },
                { id: "B", text: "Choice B" },
                { id: "C", text: "Choice C" },
                { id: "D", text: "Choice D" },
              ]
            : null;
        payload.originalityConfirmed = true;
      }

      const response = await authFetch("/api/admin/diagnostic-questions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        setActionError(json.error || "Failed to create draft.");
        return;
      }

      setStatusTab("draft");
      setQuestions((prev) => [json.question, ...prev]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create draft.");
    } finally {
      setIsDrafting(false);
    }
  };

  const patchQuestion = async (id: string, updates: Record<string, unknown>) => {
    setBusyId(id);
    setActionError(null);

    try {
      const response = await authFetch(`/api/admin/diagnostic-questions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });

      const json = await response.json();
      if (!response.ok) {
        setActionError(json.error || "Failed to update question.");
        return;
      }

      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update question.");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <Background>
        <p className="text-sm text-white/50">Loading...</p>
      </Background>
    );
  }

  if (!isLoggedIn) {
    return (
      <Background>
        <p className="text-sm text-white/50">Sign in with an admin account to review the diagnostic question bank.</p>
      </Background>
    );
  }

  return (
    <Background>
      <Link href="/admin" className="w-fit text-sm font-semibold text-indigo-300">
        &larr; Back to admin dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          Diagnostic Question Bank
        </span>
      </h1>
      <p className="mt-2 text-sm text-white/60">
        Only published questions can appear in a diagnostic. Every question needs one unambiguous
        correct answer, an explanation, an assigned skill/difficulty, and a human confirmation that
        it is original -- never copied from an official test.
      </p>

      {accessError && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
          {accessError}
        </div>
      )}

      <Card className="mt-6" padding="md">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
          >
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>

          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                statusTab === tab
                  ? "bg-indigo-500/20 text-indigo-100 border border-indigo-400/40"
                  : "bg-white/5 text-white/50 border border-white/10"
              }`}
            >
              {tab.replace("_", " ")}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4" padding="md">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">New draft</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
          >
            <option value="reading_writing">Reading and Writing</option>
            <option value="math">Math</option>
          </select>
          <select
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <input
            placeholder="Domain (e.g. Algebra)"
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder-white/35"
          />
          <input
            placeholder="Skill (e.g. Linear equations)"
            value={form.skill}
            onChange={(e) => setForm((f) => ({ ...f, skill: e.target.value }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder-white/35"
          />
          <select
            value={form.questionType}
            onChange={(e) => setForm((f) => ({ ...f, questionType: e.target.value as QuestionType }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="student_produced_response">Student-produced response</option>
          </select>
          <input
            placeholder="AI topic hint (optional)"
            value={form.topicHint}
            onChange={(e) => setForm((f) => ({ ...f, topicHint: e.target.value }))}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder-white/35"
          />
        </div>

        {actionError && <p className="mt-2 text-xs text-red-300">{actionError}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleDraft(false)} isLoading={isDrafting}>
            Start blank draft
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleDraft(true)} isLoading={isDrafting}>
            Draft with AI assist
          </Button>
        </div>
      </Card>

      <div className="mt-6 space-y-3">
        {isLoadingQuestions ? (
          <p className="text-sm text-white/50">Loading...</p>
        ) : questions.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
            No {statusTab.replace("_", " ")} questions for this exam.
          </p>
        ) : (
          questions.map((q) => (
            <Card key={q.id} padding="md">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                <span>{q.section}</span>
                <span>&middot;</span>
                <span>{q.domain}</span>
                <span>&middot;</span>
                <span>{q.skill}</span>
                <span>&middot;</span>
                <span>{q.difficulty}</span>
                <span>&middot;</span>
                <span>{q.source_type}</span>
              </div>

              {q.stimulus && <p className="mt-2 text-xs text-white/60">{q.stimulus}</p>}
              <p className="mt-2 text-sm text-white">{q.question_text}</p>

              {q.answer_choices && (
                <ul className="mt-2 space-y-1 text-xs text-white/70">
                  {q.answer_choices.map((choice) => (
                    <li
                      key={choice.id}
                      className={choice.id === q.correct_answer ? "font-bold text-green-300" : ""}
                    >
                      {choice.id}. {choice.text}
                    </li>
                  ))}
                </ul>
              )}
              {!q.answer_choices && (
                <p className="mt-2 text-xs font-bold text-green-300">Correct answer: {q.correct_answer}</p>
              )}

              <p className="mt-2 text-xs text-white/50">Explanation: {q.explanation}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {q.status === "draft" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === q.id}
                    onClick={() => patchQuestion(q.id, { status: "in_review" })}
                  >
                    Submit for review
                  </Button>
                )}
                {q.status === "in_review" && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busyId === q.id}
                      onClick={() => patchQuestion(q.id, { status: "published" })}
                    >
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === q.id}
                      onClick={() => patchQuestion(q.id, { status: "rejected" })}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {q.status === "published" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === q.id}
                    onClick={() => patchQuestion(q.id, { status: "archived" })}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </Background>
  );
}
