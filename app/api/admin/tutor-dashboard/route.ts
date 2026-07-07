import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStudyLinks(topic: string) {
  const cleanTopic = topic.trim();
  const topicQuery = encodeURIComponent(`${cleanTopic} practice`);

  return [
    {
      label: "Khan Academy",
      url: `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(
        cleanTopic
      )}`,
    },
    {
      label: "YouTube",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${cleanTopic} lesson walkthrough`
      )}`,
    },
    {
      label: "Quizlet",
      url: `https://quizlet.com/search?query=${topicQuery}&type=sets`,
    },
  ];
}

function formatTrend(delta: number): string {
  if (delta > 5) return `Improving (+${delta}%)`;
  if (delta < -5) return `Struggling (${delta}%)`;
  return `Holding steady (${delta >= 0 ? "+" : ""}${delta}%)`;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Please log in to access the admin dashboard." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Please log in to access the admin dashboard." },
        { status: 401 }
      );
    }

    const adminEmails = getAdminEmails();
    const userEmail = (user.email || "").toLowerCase();

    if (!adminEmails.includes(userEmail)) {
      return NextResponse.json(
        { error: "You do not have admin access." },
        { status: 403 }
      );
    }

    const [profilesResult, decksResult, matchesResult, questionsResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("decks")
          .select("id, title, course_name, student_name, user_id, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("matches")
          .select(
            "id, deck_id, player_name, score, correct_answers, total_questions, time_taken_seconds, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(250),
        supabase.from("questions").select("id, topic, deck_id"),
      ]);

    if (profilesResult.error) {
      return NextResponse.json(
        { error: profilesResult.error.message },
        { status: 500 }
      );
    }

    if (decksResult.error) {
      return NextResponse.json(
        { error: decksResult.error.message },
        { status: 500 }
      );
    }

    if (matchesResult.error) {
      return NextResponse.json(
        { error: matchesResult.error.message },
        { status: 500 }
      );
    }

    if (questionsResult.error) {
      return NextResponse.json(
        { error: questionsResult.error.message },
        { status: 500 }
      );
    }

    const profiles = profilesResult.data || [];
    const decks = decksResult.data || [];
    const matches = matchesResult.data || [];
    const questions = questionsResult.data || [];

    if (matches.length === 0) {
      return NextResponse.json({
        students: [],
        activeStudents: 0,
        emptyMessage:
          "No student battle data yet. Once students start playing, their progress dashboard will appear here.",
      });
    }

    const profileById = new Map(
      profiles.map((profile: { id: string; email: string | null; display_name: string | null; created_at: string }) => [
        profile.id,
        profile,
      ])
    );
    const deckById = new Map(
      decks.map(
        (deck: {
          id: string;
          title: string;
          course_name: string;
          student_name: string;
          user_id: string | null;
          created_at: string;
        }) => [deck.id, deck]
      )
    );
    const questionById = new Map(
      questions.map((question: { id: string; topic: string | null; deck_id: string }) => [
        question.id,
        question,
      ])
    );

    const recentMatchIds = matches.map((match: { id: string }) => match.id);
    const { data: matchAnswers, error: matchAnswersError } = await supabase
      .from("match_answers")
      .select("match_id, question_id, is_correct")
      .in("match_id", recentMatchIds);

    if (matchAnswersError) {
      return NextResponse.json(
        { error: matchAnswersError.message },
        { status: 500 }
      );
    }

    const matchById = new Map(
      matches.map(
        (match: {
          id: string;
          deck_id: string;
          player_name: string;
          score: number;
          correct_answers: number;
          total_questions: number;
          time_taken_seconds: number;
          created_at: string;
        }) => [match.id, match]
      )
    );

    type StudentBattle = {
      id: string;
      deckTitle: string;
      courseName: string;
      score: number;
      accuracy: number;
      timeTakenSeconds: number;
      createdAt: string;
    };

    type StudentWeakTopic = {
      topic: string;
      missedCount: number;
      studyLinks: Array<{ label: string; url: string }>;
    };

    type StudentRecord = {
      id: string;
      name: string;
      email: string | null;
      lastActiveAt: string;
      totalBattles: number;
      averageAccuracy: number;
      latestScore: number;
      latestAccuracy: number;
      bestScore: number;
      trendLabel: string;
      trendDelta: number;
      recentBattles: StudentBattle[];
      weakTopics: StudentWeakTopic[];
      practicedDecks: string[];
      recommendedNextSteps: string[];
      parentSummary: string;
    };

    type StudentAccumulator = {
      id: string;
      name: string;
      email: string | null;
      lastActiveAt: string;
      totalBattles: number;
      accuracySum: number;
      latestScore: number;
      latestAccuracy: number;
      bestScore: number;
      recentBattles: StudentBattle[];
      practicedDecks: Set<string>;
      weakTopicCounts: Map<string, number>;
    };

    const studentMap = new Map<string, StudentAccumulator>();

    const getStudentKey = (match: {
      player_name: string;
    }, deck?: {
      user_id: string | null;
      student_name: string;
    }) =>
      deck?.user_id
        ? `user:${deck.user_id}`
        : `player:${normalizeKey(
            match.player_name || deck?.student_name || "Guest"
          )}`;

    const getOrCreateStudent = (
      match: {
        id: string;
        deck_id: string;
        player_name: string;
        score: number;
        correct_answers: number;
        total_questions: number;
        time_taken_seconds: number;
        created_at: string;
      },
      deck: {
        student_name: string;
        user_id: string | null;
      } | null,
      profile: { email: string | null; display_name: string | null } | null
    ) => {
      const key = getStudentKey(match, deck || undefined);
      const existing = studentMap.get(key);
      if (existing) return existing;

      const displayName =
        profile?.display_name?.trim() ||
        deck?.student_name?.trim() ||
        match.player_name?.trim() ||
        profile?.email?.split("@")[0] ||
        "Student";

      const created: StudentAccumulator = {
        id: key,
        name: displayName,
        email: profile?.email || null,
        lastActiveAt: match.created_at,
        totalBattles: 0,
        accuracySum: 0,
        latestScore: match.score,
        latestAccuracy:
          match.total_questions > 0
            ? Math.round((match.correct_answers / match.total_questions) * 100)
            : 0,
        bestScore: 0,
        recentBattles: [],
        practicedDecks: new Set<string>(),
        weakTopicCounts: new Map<string, number>(),
      };

      studentMap.set(key, created);
      return created;
    };

    for (const match of matches as Array<{
      id: string;
      deck_id: string;
      player_name: string;
      score: number;
      correct_answers: number;
      total_questions: number;
      time_taken_seconds: number;
      created_at: string;
    }>) {
      const deck = deckById.get(match.deck_id);
      const profile = deck?.user_id ? profileById.get(deck.user_id) : null;
      const student = getOrCreateStudent(match, deck || null, profile || null);

      const accuracy =
        match.total_questions > 0
          ? Math.round((match.correct_answers / match.total_questions) * 100)
          : 0;

      student.totalBattles += 1;
      student.accuracySum += accuracy;
      student.bestScore = Math.max(student.bestScore, match.score);
      student.latestScore = match.score;
      student.latestAccuracy = accuracy;
      student.lastActiveAt = match.created_at;
      student.practicedDecks.add(deck?.title || "Untitled deck");
      student.recentBattles.push({
        id: match.id,
        deckTitle: deck?.title || "Untitled deck",
        courseName: deck?.course_name || "Study deck",
        score: match.score,
        accuracy,
        timeTakenSeconds: match.time_taken_seconds,
        createdAt: match.created_at,
      });
    }

    for (const answer of (matchAnswers || []) as Array<{
      match_id: string;
      question_id: string;
      is_correct: boolean;
    }>) {
      if (answer.is_correct) continue;

      const match = matchById.get(answer.match_id);
      if (!match) continue;

      const deck = deckById.get(match.deck_id);

      const student = studentMap.get(getStudentKey(match, deck));
      if (!student) continue;

      const question = questionById.get(answer.question_id);
      const topic = question?.topic?.trim() || "General";
      student.weakTopicCounts.set(
        topic,
        (student.weakTopicCounts.get(topic) || 0) + 1
      );
    }

    const students: StudentRecord[] = Array.from(studentMap.values())
      .map((student) => {
        const sortedBattles = [...student.recentBattles].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
        );

        const latestAccuracy = sortedBattles[0]?.accuracy ?? 0;
        const previousAccuracy = sortedBattles[1]?.accuracy ?? null;
        const trendDelta =
          previousAccuracy == null ? 0 : latestAccuracy - previousAccuracy;
        const trendLabel = formatTrend(trendDelta);

        const weakTopics = Array.from(student.weakTopicCounts.entries())
          .map(([topic, missedCount]) => ({
            topic,
            missedCount,
            studyLinks: buildStudyLinks(topic),
          }))
          .sort((left, right) => right.missedCount - left.missedCount)
          .slice(0, 4);

        const practicedDecks = Array.from(student.practicedDecks).slice(0, 4);

        const recommendedNextSteps =
          weakTopics.length > 0
            ? [
                `Review ${weakTopics[0].topic} for 10-15 minutes.`,
                "Use a rematch to check whether the next run improves.",
                "Keep the pace steady before pushing speed.",
              ]
            : [
                "Move to a harder deck to keep the challenge level high.",
                "Use one more battle to confirm the score is stable.",
                "Keep reviewing the best-performing topics to preserve momentum.",
              ];

        const parentSummary =
          weakTopics.length > 0
            ? `${student.name} completed ${student.totalBattles} battles, scored ${student.latestAccuracy}% in the latest run, and should next focus on ${weakTopics
                .slice(0, 2)
                .map((topic) => topic.topic)
                .join(" and ")}.`
            : `${student.name} completed ${student.totalBattles} battles, scored ${student.latestAccuracy}% in the latest run, and is currently holding steady with no obvious weak topics.`;

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          lastActiveAt: student.lastActiveAt,
          totalBattles: student.totalBattles,
          averageAccuracy:
            student.totalBattles > 0
              ? Math.round(student.accuracySum / student.totalBattles)
              : 0,
          latestScore: student.latestScore,
          latestAccuracy: latestAccuracy,
          bestScore: student.bestScore,
          trendLabel,
          trendDelta,
          recentBattles: sortedBattles.slice(0, 5),
          weakTopics,
          practicedDecks,
          recommendedNextSteps,
          parentSummary,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.lastActiveAt).getTime() -
          new Date(left.lastActiveAt).getTime()
      );

    return NextResponse.json({
      students,
      activeStudents: students.length,
      emptyMessage:
        "No student battle data yet. Once students start playing, their progress dashboard will appear here.",
    });
  } catch (error) {
    console.error("Tutor dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}