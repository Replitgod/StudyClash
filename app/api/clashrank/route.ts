import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DeckRow = {
  id: string;
  title: string;
  course_name: string;
};

type MatchRow = {
  id: string;
  deck_id: string;
  player_name: string;
  user_id: string | null;
  correct_answers: number;
  total_questions: number;
  score: number;
  time_taken_seconds: number;
  created_at: string;
};

type MatchAnswerRow = {
  match_id: string;
  question_id: string;
  is_correct: boolean;
  response_time_ms: number | null;
};

type QuestionRow = {
  id: string;
  deck_id: string;
  topic: string;
};

type MistakeRow = {
  match_id: string;
  deck_id: string;
};

type RankedEntry = {
  rank: number;
  playerName: string;
  clashRank: string;
  clashScore: number;
  improvementScore: number;
  weaknessCrusherScore: number;
  consistencyScore: number;
  speedImprovementScore: number;
  masteryGrowthScore: number;
  bossWins: number;
  rematchesCompleted: number;
  accuracy: number;
};

type PlayerAggregate = {
  playerName: string;
  userId: string | null;
  matches: MatchRow[];
  matchIds: string[];
  deckIds: string[];
  averageAccuracy: number;
  improvement: number;
  consistency: number;
  speedImprovement: number;
  masteryGrowth: number;
  weakRematches: number;
  bossWins: number;
  clashScore: number;
  improvementScore: number;
  weaknessCrusherScore: number;
  consistencyScore: number;
  speedImprovementScore: number;
  masteryGrowthScore: number;
  clashRank: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const CLASH_RANKS = [
  { label: "Bronze", min: 0 },
  { label: "Silver", min: 38 },
  { label: "Gold", min: 50 },
  { label: "Platinum", min: 62 },
  { label: "Diamond", min: 74 },
  { label: "Champion", min: 86 },
  { label: "Legend", min: 95 },
] as const;

function normalizePlayerName(input: string): string {
  return input.trim() || "Unknown";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getAccuracy(match: MatchRow): number {
  if (!match.total_questions) return 0;
  return (match.correct_answers / match.total_questions) * 100;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function rankForScore(score: number): (typeof CLASH_RANKS)[number]["label"] {
  let current: (typeof CLASH_RANKS)[number]["label"] = CLASH_RANKS[0].label;
  for (const tier of CLASH_RANKS) {
    if (score >= tier.min) current = tier.label;
  }
  return current;
}

function toScore100(raw: number): number {
  return Math.round(clamp(raw, 0, 100) * 10) / 10;
}

function makeRanked(entries: PlayerAggregate[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => b.clashScore - a.clashScore || b.averageAccuracy - a.averageAccuracy);
  return sorted.map((entry, index) => ({
    rank: index + 1,
    playerName: entry.playerName,
    clashRank: entry.clashRank,
    clashScore: entry.clashScore,
    improvementScore: entry.improvementScore,
    weaknessCrusherScore: entry.weaknessCrusherScore,
    consistencyScore: entry.consistencyScore,
    speedImprovementScore: entry.speedImprovementScore,
    masteryGrowthScore: entry.masteryGrowthScore,
    bossWins: entry.bossWins,
    rematchesCompleted: entry.weakRematches,
    accuracy: toScore100(entry.averageAccuracy),
  }));
}

function splitOldNew<T>(items: T[]): { oldItems: T[]; newItems: T[] } {
  if (items.length <= 2) {
    return {
      oldItems: items.slice(0, Math.max(1, Math.floor(items.length / 2))),
      newItems: items.slice(Math.max(1, Math.floor(items.length / 2))),
    };
  }

  const midpoint = Math.floor(items.length / 2);
  return {
    oldItems: items.slice(0, midpoint),
    newItems: items.slice(midpoint),
  };
}

function buildPlayerAggregate(args: {
  playerName: string;
  userId: string | null;
  matches: MatchRow[];
  answersByMatch: Map<string, MatchAnswerRow[]>;
  questionById: Map<string, QuestionRow>;
  mistakeMatchIds: Set<string>;
}): PlayerAggregate {
  const { playerName, userId, matches, answersByMatch, questionById, mistakeMatchIds } = args;

  const sortedMatches = [...matches].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const accuracies = sortedMatches.map((match) => getAccuracy(match));
  const averageAccuracy = average(accuracies);

  const { oldItems: oldMatches, newItems: newMatches } = splitOldNew(sortedMatches);
  const oldAccuracy = average(oldMatches.map((match) => getAccuracy(match)));
  const newAccuracy = average(newMatches.map((match) => getAccuracy(match)));
  const improvement = newAccuracy - oldAccuracy;

  const consistencyPenalty = standardDeviation(accuracies);
  const consistency = 100 - clamp(consistencyPenalty * 2.2, 0, 60);

  const oldSpeed = average(
    oldMatches.map((match) => {
      const answerRows = answersByMatch.get(match.id) || [];
      const valid = answerRows
        .map((answer) => Number(answer.response_time_ms || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (valid.length === 0 && match.total_questions > 0) {
        return (match.time_taken_seconds * 1000) / match.total_questions;
      }
      return average(valid);
    })
  );

  const newSpeed = average(
    newMatches.map((match) => {
      const answerRows = answersByMatch.get(match.id) || [];
      const valid = answerRows
        .map((answer) => Number(answer.response_time_ms || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (valid.length === 0 && match.total_questions > 0) {
        return (match.time_taken_seconds * 1000) / match.total_questions;
      }
      return average(valid);
    })
  );

  const speedImprovement = oldSpeed > 0 ? ((oldSpeed - newSpeed) / oldSpeed) * 100 : 0;

  const topicAccuracyByPeriod = new Map<string, { oldCorrect: number; oldTotal: number; newCorrect: number; newTotal: number }>();

  for (const match of oldMatches) {
    for (const answer of answersByMatch.get(match.id) || []) {
      const question = questionById.get(answer.question_id);
      if (!question) continue;
      const topic = question.topic || "General";
      const bucket = topicAccuracyByPeriod.get(topic) || {
        oldCorrect: 0,
        oldTotal: 0,
        newCorrect: 0,
        newTotal: 0,
      };
      bucket.oldTotal += 1;
      if (answer.is_correct) bucket.oldCorrect += 1;
      topicAccuracyByPeriod.set(topic, bucket);
    }
  }

  for (const match of newMatches) {
    for (const answer of answersByMatch.get(match.id) || []) {
      const question = questionById.get(answer.question_id);
      if (!question) continue;
      const topic = question.topic || "General";
      const bucket = topicAccuracyByPeriod.get(topic) || {
        oldCorrect: 0,
        oldTotal: 0,
        newCorrect: 0,
        newTotal: 0,
      };
      bucket.newTotal += 1;
      if (answer.is_correct) bucket.newCorrect += 1;
      topicAccuracyByPeriod.set(topic, bucket);
    }
  }

  const topicGrowthValues: number[] = [];
  let weakRematches = 0;

  for (const stats of topicAccuracyByPeriod.values()) {
    const oldTopicAccuracy = stats.oldTotal > 0 ? (stats.oldCorrect / stats.oldTotal) * 100 : 0;
    const newTopicAccuracy = stats.newTotal > 0 ? (stats.newCorrect / stats.newTotal) * 100 : 0;

    if (stats.oldTotal >= 2 && stats.newTotal >= 2) {
      topicGrowthValues.push(newTopicAccuracy - oldTopicAccuracy);
      if (oldTopicAccuracy < 60 && newTopicAccuracy > oldTopicAccuracy + 8) {
        weakRematches += 1;
      }
    }
  }

  const masteryGrowth = average(topicGrowthValues);

  const strongPerformanceWins = sortedMatches.filter(
    (match) => getAccuracy(match) >= 85 && match.score >= match.total_questions * 95
  ).length;
  const mistakeDrivenWins = sortedMatches.filter((match) => mistakeMatchIds.has(match.id)).length;
  const bossWins = Math.min(strongPerformanceWins, Math.max(1, Math.floor(mistakeDrivenWins * 0.6 + 0.5)));

  // Anti-grind weighting: volume has low direct impact; gains and stability dominate.
  const improvementScore = toScore100(clamp(45 + improvement * 2.2, 0, 100));
  const consistencyScore = toScore100(consistency);
  const speedImprovementScore = toScore100(clamp(50 + speedImprovement * 1.7, 0, 100));
  const masteryGrowthScore = toScore100(clamp(50 + masteryGrowth * 2.1, 0, 100));
  const weaknessCrusherScore = toScore100(clamp(35 + weakRematches * 9 + masteryGrowth * 1.4, 0, 100));
  const bossWinScore = toScore100(clamp(30 + bossWins * 11, 0, 100));

  const clashScore = toScore100(
    improvementScore * 0.26 +
      toScore100(averageAccuracy) * 0.22 +
      consistencyScore * 0.16 +
      speedImprovementScore * 0.12 +
      masteryGrowthScore * 0.12 +
      weaknessCrusherScore * 0.08 +
      bossWinScore * 0.04
  );

  return {
    playerName,
    userId,
    matches: sortedMatches,
    matchIds: sortedMatches.map((match) => match.id),
    deckIds: Array.from(new Set(sortedMatches.map((match) => match.deck_id))),
    averageAccuracy,
    improvement,
    consistency,
    speedImprovement,
    masteryGrowth,
    weakRematches,
    bossWins,
    clashScore,
    improvementScore,
    weaknessCrusherScore,
    consistencyScore,
    speedImprovementScore,
    masteryGrowthScore,
    clashRank: rankForScore(clashScore),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString();

    const [decksResult, matchesResult] = await Promise.all([
      supabase
        .from("decks")
        .select("id, title, course_name")
        .order("created_at", { ascending: false }),
      supabase
        .from("matches")
        .select("id, deck_id, player_name, user_id, correct_answers, total_questions, score, time_taken_seconds, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2500),
    ]);

    if (decksResult.error || matchesResult.error) {
      return NextResponse.json(
        { error: decksResult.error?.message || matchesResult.error?.message || "Failed to load ClashRank data." },
        { status: 500 }
      );
    }

    const decks = (decksResult.data || []) as DeckRow[];
    const matches = (matchesResult.data || []) as MatchRow[];

    if (matches.length === 0) {
      return NextResponse.json({
        personalRank: null,
        classRank: null,
        weeklyLeaderboard: [],
        subjectRanks: [],
        improvementLeaderboard: [],
        weaknessCrusherLeaderboard: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const matchIds = matches.map((match) => match.id);

    const [answersResult, questionsResult, mistakesResult] = await Promise.all([
      supabase
        .from("match_answers")
        .select("match_id, question_id, is_correct, response_time_ms")
        .in("match_id", matchIds),
      supabase
        .from("questions")
        .select("id, deck_id, topic"),
      supabase
        .from("mistake_breakdowns")
        .select("match_id, deck_id")
        .in("match_id", matchIds),
    ]);

    if (answersResult.error || questionsResult.error || mistakesResult.error) {
      return NextResponse.json(
        {
          error:
            answersResult.error?.message ||
            questionsResult.error?.message ||
            mistakesResult.error?.message ||
            "Failed to load ClashRank details.",
        },
        { status: 500 }
      );
    }

    const answers = (answersResult.data || []) as MatchAnswerRow[];
    const questions = (questionsResult.data || []) as QuestionRow[];
    const mistakes = (mistakesResult.data || []) as MistakeRow[];

    const deckById = new Map(decks.map((deck) => [deck.id, deck]));
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const answersByMatch = new Map<string, MatchAnswerRow[]>();

    for (const answer of answers) {
      const bucket = answersByMatch.get(answer.match_id) || [];
      bucket.push(answer);
      answersByMatch.set(answer.match_id, bucket);
    }

    const mistakeMatchIds = new Set(mistakes.map((row) => row.match_id));

    const matchesByPlayer = new Map<string, MatchRow[]>();
    for (const match of matches) {
      const key = normalizePlayerName(match.player_name);
      const bucket = matchesByPlayer.get(key) || [];
      bucket.push(match);
      matchesByPlayer.set(key, bucket);
    }

    const aggregates: PlayerAggregate[] = Array.from(matchesByPlayer.entries())
      .map(([playerName, playerMatches]) =>
        buildPlayerAggregate({
          playerName,
          userId: playerMatches[0]?.user_id || null,
          matches: playerMatches,
          answersByMatch,
          questionById,
          mistakeMatchIds,
        })
      )
      .filter((entry) => entry.matches.length >= 2);

    const rankedAll = makeRanked(aggregates);

    const currentPlayer =
      aggregates.find((entry) => entry.userId === user.id) ||
      aggregates.find((entry) => entry.playerName.toLowerCase() === (user.email?.split("@")[0] || "").toLowerCase()) ||
      null;

    if (!currentPlayer) {
      return NextResponse.json({
        personalRank: null,
        classRank: null,
        weeklyLeaderboard: rankedAll.slice(0, 10),
        subjectRanks: [],
        improvementLeaderboard: rankedAll
          .slice()
          .sort((a, b) => b.improvementScore - a.improvementScore)
          .slice(0, 10),
        weaknessCrusherLeaderboard: rankedAll
          .slice()
          .sort((a, b) => b.weaknessCrusherScore - a.weaknessCrusherScore)
          .slice(0, 10),
        generatedAt: new Date().toISOString(),
      });
    }

    const personalRankIndex = rankedAll.findIndex((entry) => entry.playerName === currentPlayer.playerName);
    const personalRank = personalRankIndex >= 0 ? rankedAll[personalRankIndex] : null;

    const deckFrequency = new Map<string, number>();
    for (const match of currentPlayer.matches) {
      deckFrequency.set(match.deck_id, (deckFrequency.get(match.deck_id) || 0) + 1);
    }
    const topDeckId = Array.from(deckFrequency.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topCourse = topDeckId ? deckById.get(topDeckId)?.course_name || null : null;

    const classPool = topCourse
      ? aggregates.filter((entry) =>
          entry.matches.some((match) => deckById.get(match.deck_id)?.course_name === topCourse)
        )
      : aggregates;

    const classRanked = makeRanked(classPool);
    const classRank = classRanked.find((entry) => entry.playerName === currentPlayer.playerName) || null;

    const weeklyCutoff = Date.now() - 1000 * 60 * 60 * 24 * 7;
    const weeklyAggregates = aggregates
      .map((entry) => {
        const weeklyMatches = entry.matches.filter(
          (match) => new Date(match.created_at).getTime() >= weeklyCutoff
        );
        if (weeklyMatches.length < 2) return null;

        return buildPlayerAggregate({
          playerName: entry.playerName,
          userId: entry.userId,
          matches: weeklyMatches,
          answersByMatch,
          questionById,
          mistakeMatchIds,
        });
      })
      .filter((entry): entry is PlayerAggregate => entry !== null);

    const weeklyLeaderboard = makeRanked(weeklyAggregates).slice(0, 20);

    const subjectMap = new Map<string, Map<string, MatchRow[]>>();
    for (const match of matches) {
      const subject = deckById.get(match.deck_id)?.course_name || "General";
      const byPlayer = subjectMap.get(subject) || new Map<string, MatchRow[]>();
      const key = normalizePlayerName(match.player_name);
      const bucket = byPlayer.get(key) || [];
      bucket.push(match);
      byPlayer.set(key, bucket);
      subjectMap.set(subject, byPlayer);
    }

    const subjectRanks = Array.from(subjectMap.entries())
      .map(([subject, byPlayer]) => {
        const entries = Array.from(byPlayer.entries())
          .map(([playerName, playerMatches]) =>
            buildPlayerAggregate({
              playerName,
              userId: playerMatches[0]?.user_id || null,
              matches: playerMatches,
              answersByMatch,
              questionById,
              mistakeMatchIds,
            })
          )
          .filter((entry) => entry.matches.length >= 2);

        const ranked = makeRanked(entries);
        const mine = ranked.find((entry) => entry.playerName === currentPlayer.playerName);
        if (!mine) return null;

        return {
          subject,
          rank: mine.rank,
          clashRank: mine.clashRank,
          clashScore: mine.clashScore,
          totalPlayers: ranked.length,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.rank - b.rank || b.clashScore - a.clashScore);

    const improvementLeaderboard = makeRanked(aggregates)
      .sort((a, b) => b.improvementScore - a.improvementScore || b.clashScore - a.clashScore)
      .slice(0, 20);

    const weaknessCrusherLeaderboard = makeRanked(aggregates)
      .sort(
        (a, b) =>
          b.weaknessCrusherScore - a.weaknessCrusherScore ||
          b.rematchesCompleted - a.rematchesCompleted ||
          b.clashScore - a.clashScore
      )
      .slice(0, 20);

    return NextResponse.json({
      personalRank,
      classRank: classRank
        ? {
            ...classRank,
            className: topCourse || "General",
            totalPlayers: classRanked.length,
          }
        : null,
      weeklyLeaderboard,
      subjectRanks,
      improvementLeaderboard,
      weaknessCrusherLeaderboard,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load ClashRank.",
      },
      { status: 500 }
    );
  }
}
