"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Match = {
  id: string;
  deck_id: string;
  player_name: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_taken_seconds: number;
  created_at?: string;
};

type Deck = {
  id: string;
  title: string;
  course_name: string;
  student_name: string;
  raw_notes?: string;
  created_at?: string;
};

type Question = {
  id: string;
  deck_id: string;
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
};

type MatchAnswer = {
  id: string;
  match_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms?: number;
};

type ReviewItem = {
  question: Question;
  answer?: MatchAnswer;
};

export default function ResultsPage() {
  const params = useParams();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<MatchAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadResults() {
      try {
        setLoading(true);

        const { data: matchData, error: matchError } = await supabase
          .from("matches")
          .select("*")
          .eq("id", matchId)
          .single();

        if (matchError) {
          throw new Error(matchError.message);
        }

        setMatch(matchData);

        const { data: deckData, error: deckError } = await supabase
          .from("decks")
          .select("*")
          .eq("id", matchData.deck_id)
          .single();

        if (deckError) {
          throw new Error(deckError.message);
        }

        setDeck(deckData);

        const { data: questionData, error: questionError } = await supabase
          .from("questions")
          .select("*")
          .eq("deck_id", matchData.deck_id);

        if (questionError) {
          throw new Error(questionError.message);
        }

        setQuestions(questionData || []);

        const { data: answerData, error: answerError } = await supabase
          .from("match_answers")
          .select("*")
          .eq("match_id", matchId);

        if (answerError) {
          console.warn("Could not load match_answers:", answerError.message);
          setAnswers([]);
        } else {
          setAnswers(answerData || []);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load results.";
        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    }

    if (matchId) {
      loadResults();
    }
  }, [matchId]);

  const reviewItems: ReviewItem[] = useMemo(() => {
    return questions.map((question) => {
      const answer = answers.find((a) => a.question_id === question.id);
      return { question, answer };
    });
  }, [questions, answers]);

  const accuracy = useMemo(() => {
    if (!match || match.total_questions === 0) return 0;
    return Math.round((match.correct_answers / match.total_questions) * 100);
  }, [match]);

  const weakTopics = useMemo(() => {
    const missed: Record<string, number> = {};

    reviewItems.forEach((item) => {
      const isWrong =
        item.answer && item.answer.selected_answer !== item.question.correct_answer;

      if (isWrong) {
        const topic = item.question.topic || "General Review";
        missed[topic] = (missed[topic] || 0) + 1;
      }
    });

    return Object.entries(missed)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [reviewItems]);

  function getRankMessage() {
    if (accuracy >= 90) return "Diamond Brain";
    if (accuracy >= 75) return "Clash Pro";
    if (accuracy >= 60) return "Solid Run";
    return "Needs Review";
  }

  async function copyChallengeLink() {
    if (!deck?.id) return;

    const link = `${window.location.origin}/battle/${deck.id}`;
    await navigator.clipboard.writeText(link);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6">
          <p className="text-lg text-purple-200">Loading results...</p>
        </div>
      </main>
    );
  }

  if (errorMessage || !match || !deck) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <h1 className="text-3xl font-bold">Results not found</h1>
          <p className="mt-3 text-red-200">
            {errorMessage || "This match could not be loaded."}
          </p>

          <Link
            href="/create"
            className="mt-6 inline-flex rounded-2xl bg-purple-500 px-6 py-3 font-semibold text-white hover:bg-purple-600"
          >
            Create New Battle
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-500/20 via-white/5 to-blue-500/10 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-purple-300">
            Battle Complete
          </p>

          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black md:text-6xl">
                {getRankMessage()}
              </h1>
              <p className="mt-3 text-lg text-gray-300">
                {match.player_name} finished{" "}
                <span className="font-semibold text-white">{deck.title}</span>
              </p>
              <p className="mt-1 text-sm text-gray-400">{deck.course_name}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 px-8 py-6 text-center">
              <p className="text-sm text-gray-400">Final Score</p>
              <p className="text-5xl font-black text-purple-300">
                {match.score}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
              <p className="text-sm text-gray-400">Accuracy</p>
              <p className="mt-2 text-3xl font-bold">{accuracy}%</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
              <p className="text-sm text-gray-400">Correct Answers</p>
              <p className="mt-2 text-3xl font-bold">
                {match.correct_answers}/{match.total_questions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
              <p className="text-sm text-gray-400">Time Taken</p>
              <p className="mt-2 text-3xl font-bold">
                {match.time_taken_seconds}s
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              onClick={copyChallengeLink}
              className="rounded-2xl bg-purple-500 px-6 py-3 font-semibold text-white transition hover:bg-purple-600"
            >
              {copied ? "Copied!" : "Copy Challenge Link"}
            </button>

            <Link
              href={`/battle/${deck.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-purple-400/40 bg-purple-500/10 px-6 py-3 font-semibold text-purple-200 transition hover:bg-purple-500/20 hover:text-white"
            >
              View Leaderboard
            </Link>

            <Link
              href={`/battle/${deck.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20"
            >
              Play Again
            </Link>

            <Link
              href="/create"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20"
            >
              Create New Deck
            </Link>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-purple-300">
                AI Report
              </p>
              <h2 className="mt-2 text-3xl font-bold">Weak Topic Report</h2>
            </div>
          </div>

          {weakTopics.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-green-400/30 bg-green-500/10 p-5">
              <p className="font-semibold text-green-200">
                No weak topics. Perfect run.
              </p>
              <p className="mt-1 text-sm text-green-100/80">
                You got every tracked question correct.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {weakTopics.map((item) => (
                <div
                  key={item.topic}
                  className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-bold text-red-100">
                      {item.topic}
                    </h3>
                    <p className="rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-100">
                      {item.count} missed
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-red-100/80">
                    Review this topic and replay the battle to improve your
                    score.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-purple-300">
            Review
          </p>
          <h2 className="mt-2 text-3xl font-bold">Answer Breakdown</h2>

          <div className="mt-6 space-y-5">
            {reviewItems.length === 0 ? (
              <p className="text-gray-400">
                No answer review found for this match.
              </p>
            ) : (
              reviewItems.map((item, index) => {
                const selectedAnswer =
                  item.answer?.selected_answer || "No answer recorded";
                const isCorrect =
                  selectedAnswer === item.question.correct_answer ||
                  item.answer?.is_correct === true;

                return (
                  <div
                    key={item.question.id}
                    className={`rounded-3xl border p-6 ${
                      isCorrect
                        ? "border-green-400/30 bg-green-500/10"
                        : "border-red-400/30 bg-red-500/10"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-400">
                          Question {index + 1} • {item.question.topic} •{" "}
                          {item.question.difficulty}
                        </p>
                        <h3 className="mt-2 text-xl font-bold">
                          {item.question.question_text}
                        </h3>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          isCorrect
                            ? "bg-green-500/20 text-green-200"
                            : "bg-red-500/20 text-red-200"
                        }`}
                      >
                        {isCorrect ? "Correct" : "Wrong"}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-sm text-gray-400">Your Answer</p>
                        <p className="mt-1 font-semibold">{selectedAnswer}</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-sm text-gray-400">Correct Answer</p>
                        <p className="mt-1 font-semibold text-green-200">
                          {item.question.correct_answer}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-sm text-gray-400">Explanation</p>
                      <p className="mt-1 text-gray-200">
                        {item.question.explanation ||
                          "No explanation available."}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}