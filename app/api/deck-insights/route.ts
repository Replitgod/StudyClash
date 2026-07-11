import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getServiceSupabaseClient();
    const userId = auth.userId;

    // Fetch all user decks
    const { data: decks, error: decksError } = await supabase
      .from("decks")
      .select("id, title, course_name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (decksError) {
      return NextResponse.json(
        { error: "Failed to fetch decks" },
        { status: 500 }
      );
    }

    if (!decks || decks.length === 0) {
      return NextResponse.json({
        mostPlayed: [],
        strongest: [],
        weakest: [],
        recentlyPlayed: [],
        recommendedNextBattle: null,
      });
    }

    const deckIds = decks.map((d) => d.id);

    // Fetch all matches for these decks
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id, deck_id, correct_answers, total_questions, created_at")
      .in("deck_id", deckIds);

    if (matchesError) {
      return NextResponse.json(
        { error: "Failed to fetch matches" },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        mostPlayed: [],
        strongest: [],
        weakest: [],
        recentlyPlayed: [],
        recommendedNextBattle: null,
      });
    }

    // Build deck stats
    const deckStatsMap = new Map<
      string,
      {
        deck: (typeof decks)[0];
        matchCount: number;
        totalAccuracy: number;
        bestScore: number;
        latestMatch: Date;
      }
    >();

    for (const deck of decks) {
      deckStatsMap.set(deck.id, {
        deck,
        matchCount: 0,
        totalAccuracy: 0,
        bestScore: 0,
        latestMatch: new Date(deck.created_at),
      });
    }

    // Process matches
    for (const match of matches) {
      const stats = deckStatsMap.get(match.deck_id);
      if (!stats) continue;

      const accuracy =
        match.total_questions > 0
          ? (match.correct_answers / match.total_questions) * 100
          : 0;
      const score = (match.correct_answers / match.total_questions) * 100;

      stats.matchCount++;
      stats.totalAccuracy += accuracy;
      stats.bestScore = Math.max(stats.bestScore, score);
      stats.latestMatch = new Date(match.created_at);
    }

    const deckArray = Array.from(deckStatsMap.values()).filter(
      (d) => d.matchCount > 0
    );

    // Most Played: sort by match count
    const mostPlayed = [...deckArray]
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5)
      .map((d) => ({
        id: d.deck.id,
        title: d.deck.title,
        courseN: d.deck.course_name,
        matchesPlayed: d.matchCount,
      }));

    // Strongest: sort by average accuracy
    const strongest = [...deckArray]
      .sort((a, b) => {
        const avgA = a.totalAccuracy / a.matchCount;
        const avgB = b.totalAccuracy / b.matchCount;
        return avgB - avgA;
      })
      .slice(0, 5)
      .map((d) => ({
        id: d.deck.id,
        title: d.deck.title,
        courseN: d.deck.course_name,
        averageAccuracy: Math.round(
          (d.totalAccuracy / d.matchCount) * 10
        ) / 10,
        bestScore: Math.round(d.bestScore),
      }));

    // Weakest: sort by lowest average accuracy (only if they have matches)
    const weakest = [...deckArray]
      .sort((a, b) => {
        const avgA = a.totalAccuracy / a.matchCount;
        const avgB = b.totalAccuracy / b.matchCount;
        return avgA - avgB;
      })
      .slice(0, 5)
      .map((d) => ({
        id: d.deck.id,
        title: d.deck.title,
        courseN: d.deck.course_name,
        averageAccuracy: Math.round(
          (d.totalAccuracy / d.matchCount) * 10
        ) / 10,
        matchesPlayed: d.matchCount,
      }));

    // Recently Played: sort by latest match date
    const recentlyPlayed = [...deckArray]
      .sort((a, b) => b.latestMatch.getTime() - a.latestMatch.getTime())
      .slice(0, 5)
      .map((d) => ({
        id: d.deck.id,
        title: d.deck.title,
        courseN: d.deck.course_name,
        lastPlayedDate: d.latestMatch.toISOString(),
      }));

    // Recommended Next Battle: pick weakest, or most recently created if no matches
    let recommendedNextBattle = null;
    if (weakest.length > 0) {
      const weakestDeck = weakest[0];
      recommendedNextBattle = {
        id: weakestDeck.id,
        title: weakestDeck.title,
        courseN: weakestDeck.courseN,
        reason: "Review this deck to improve your weakest area.",
      };
    } else {
      // Pick most recently created
      const mostRecentDeck = [...decks].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      if (mostRecentDeck) {
        recommendedNextBattle = {
          id: mostRecentDeck.id,
          title: mostRecentDeck.title,
          courseN: mostRecentDeck.course_name,
          reason: "Play your latest deck to keep your skills sharp.",
        };
      }
    }

    return NextResponse.json({
      mostPlayed,
      strongest,
      weakest,
      recentlyPlayed,
      recommendedNextBattle,
    });
  } catch (error) {
    console.error("Deck insights error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
