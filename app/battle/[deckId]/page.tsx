"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Deck = {
  id: string;
  title: string;
  course_name: string;
  student_name: string;
};

type Question = {
  id: string;
  deck_id: string;
  question_text: string;
  answer_choices: string[] | string;
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
};

type Match = {
  id: string;
  deck_id: string;
  player_name: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_taken_seconds: number;
};

type AnswerRecord = {
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms: number;
};

function normalizeChoices(choices: string[] | string): string[] {
  if (Array.isArray(choices)) return choices;

  try {
    const parsed = JSON.parse(choices);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function BattlePage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [leaderboard, setLeaderboard] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [battleStarted, setBattleStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const answerRecordsRef = useRef<AnswerRecord[]>([]);
  const scoreRef = useRef(0);
  const correctAnswersRef = useRef(0);
  const questionStartTimeRef = useRef(Date.now());
  const savingRef = useRef(false);

  useEffect(() => {
    async function loadBattle() {
      setLoading(true);

      const { data: deckData, error: deckError } = await supabase
        .from("decks")
        .select("*")
        .eq("id", deckId)
        .single();

      if (deckError) {
        console.error("Deck load error:", deckError.message);
        setLoading(false);
        return;
      }

      const { data: questionData, error: questionError } = await supabase
        .from("questions")
        .select("*")
        .eq("deck_id", deckId);

      if (questionError) {
        console.error("Questions load error:", questionError.message);
        setLoading(false);
        return;
      }

      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from("matches")
        .select("*")
        .eq("deck_id", deckId)
        .order("score", { ascending: false })
        .order("time_taken_seconds", { ascending: true })
        .limit(5);

      if (leaderboardError) {
        console.error("Leaderboard load error:", leaderboardError.message);
      }

      setDeck(deckData);
      setQuestions(questionData || []);
      setLeaderboard(leaderboardData || []);
      setLoading(false);
    }

    if (deckId) {
      loadBattle();
    }
  }, [deckId]);

  useEffect(() => {
    if (!battleStarted || savingRef.current) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishBattle();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [battleStarted]);

  function startBattle() {
    answerRecordsRef.current = [];
    scoreRef.current = 0;
    correctAnswersRef.current = 0;

    setCurrentIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setTimeLeft(90);
    setBattleStarted(true);

    questionStartTimeRef.current = Date.now();
  }

  async function answerQuestion(choice: string) {
    if (savingRef.current) return;

    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const responseTimeMs = Date.now() - questionStartTimeRef.current;
    const isCorrect = choice === currentQuestion.correct_answer;

    const newAnswerRecord: AnswerRecord = {
      question_id: currentQuestion.id,
      selected_answer: choice,
      is_correct: isCorrect,
      response_time_ms: responseTimeMs,
    };

    answerRecordsRef.current = [...answerRecordsRef.current, newAnswerRecord];

    if (isCorrect) {
      scoreRef.current += 100;
      correctAnswersRef.current += 1;

      setScore(scoreRef.current);
      setCorrectAnswers(correctAnswersRef.current);
    }

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      questionStartTimeRef.current = Date.now();
    } else {
      await finishBattle();
    }
  }

  async function finishBattle() {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);

    const finalScore = scoreRef.current;
    const finalCorrectAnswers = correctAnswersRef.current;
    const finalTimeTaken = 90 - timeLeft;
    const finalAnswers = answerRecordsRef.current;

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .insert({
        deck_id: deckId,
        player_name: deck?.student_name || "Anonymous Player",
        score: finalScore,
        total_questions: questions.length,
        correct_answers: finalCorrectAnswers,
        time_taken_seconds: finalTimeTaken,
      })
      .select()
      .single();

    if (matchError) {
      console.error("Match save error:", matchError.message);
      alert("Error saving match. Check console.");
      savingRef.current = false;
      setSaving(false);
      return;
    }

    if (finalAnswers.length > 0) {
      const answersToInsert = finalAnswers.map((answer) => ({
        match_id: matchData.id,
        question_id: answer.question_id,
        selected_answer: answer.selected_answer,
        is_correct: answer.is_correct,
        response_time_ms: answer.response_time_ms,
      }));

      const { error: answersError } = await supabase
        .from("match_answers")
        .insert(answersToInsert);

      if (answersError) {
        console.error("Match answers save error:", answersError.message);
        alert("Match saved, but answers were not saved. Check console.");
        savingRef.current = false;
        setSaving(false);
        return;
      }
    }

    router.push(`/results/${matchData.id}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6">
          <p className="text-lg text-purple-200">Loading battle...</p>
        </div>
      </main>
    );
  }

  if (!deck || questions.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <h1 className="text-3xl font-bold">Battle not found</h1>
          <p className="mt-3 text-red-200">
            This deck has no questions yet.
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

  if (!battleStarted) {
    return (
      <main className="min-h-screen bg-black px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href="/decks" className="text-sm text-purple-300 hover:text-purple-200">
            ← Back to decks
          </Link>

          <section className="mt-8 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-500/20 via-white/5 to-blue-500/10 p-8 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-purple-300">
              StudyClash Battle
            </p>

            <h1 className="mt-4 text-4xl font-black md:text-6xl">
              {deck.title}
            </h1>

            <p className="mt-3 text-lg text-gray-300">
              {deck.course_name}
            </p>

            <p className="mt-2 text-sm text-gray-400">
              Created by {deck.student_name}
            </p>

            <button
              onClick={startBattle}
              className="mt-8 rounded-2xl bg-purple-500 px-8 py-4 text-lg font-semibold text-white transition hover:bg-purple-600"
            >
              Start 90-Second Battle
            </button>
          </section>

          <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-purple-300">
              Leaderboard
            </p>
            <h2 className="mt-2 text-3xl font-bold">Top Scores</h2>

            {leaderboard.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-5 text-gray-300">
                No scores yet. Be the first to play.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {leaderboard.map((match, index) => {
                  const accuracy =
                    match.total_questions > 0
                      ? Math.round(
                          (match.correct_answers / match.total_questions) * 100
                        )
                      : 0;

                  return (
                    <div
                      key={match.id}
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-bold">
                          #{index + 1} {match.player_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {match.correct_answers}/{match.total_questions} correct
                        </p>
                      </div>

                      <div className="flex gap-3 text-sm">
                        <span className="rounded-full bg-purple-500/20 px-3 py-1 text-purple-200">
                          {match.score} pts
                        </span>
                        <span className="rounded-full bg-blue-500/20 px-3 py-1 text-blue-200">
                          {accuracy}%
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-white">
                          {match.time_taken_seconds}s
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  const currentQuestion = questions[currentIndex];
  const choices = normalizeChoices(currentQuestion.answer_choices);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-purple-300">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <h1 className="text-2xl font-bold">{deck.title}</h1>
          </div>

          <div className="rounded-xl bg-purple-500/20 px-4 py-2 font-bold text-purple-200">
            {timeLeft}s
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
          <p className="text-sm text-gray-400">
            {currentQuestion.topic || "General"} •{" "}
            {currentQuestion.difficulty || "medium"}
          </p>

          <h2 className="mt-4 text-3xl font-bold">
            {currentQuestion.question_text}
          </h2>

          <div className="mt-8 grid gap-4">
            {choices.map((choice, index) => (
              <button
                key={index}
                onClick={() => answerQuestion(choice)}
                disabled={saving}
                className="rounded-2xl border border-white/10 bg-black px-5 py-4 text-left text-lg transition hover:border-purple-400 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-between text-gray-300">
          <p>Score: {score}</p>
          <p>Correct: {correctAnswers}</p>
        </div>

        {saving && (
          <p className="mt-6 text-center text-purple-300">
            Saving battle results...
          </p>
        )}
      </div>
    </main>
  );
}