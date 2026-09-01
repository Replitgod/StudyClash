import type { MetadataRoute } from "next";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

// Published study sets are the only part of this sitemap that grows, and
// the reason the sitemap matters at all: a static list of nine marketing
// pages does not compete for search traffic with a category whose leader
// has millions of indexed sets. Capped because a sitemap has a 50,000-URL
// limit and a single file should stay small enough to fetch quickly; split
// into an index if this ever approaches it.
const MAX_PUBLIC_DECKS = 5_000;

async function publicDeckEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = getServiceSupabaseClient();
    const { data } = await supabase
      .from("decks")
      .select("share_slug, shared_at")
      .eq("is_public", true)
      .not("share_slug", "is", null)
      .order("shared_at", { ascending: false })
      .limit(MAX_PUBLIC_DECKS);

    return (data || []).map((deck) => ({
      url: `${siteUrl}/d/${deck.share_slug}`,
      lastModified: deck.shared_at ? new Date(deck.shared_at) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // A sitemap that 500s is worse than one missing its long tail: Google
    // drops the whole file rather than re-reading the static half.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const routes: Array<{
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }> = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.95 },
    { path: "/exams", changeFrequency: "weekly", priority: 0.9 },
    { path: "/exams/sat", changeFrequency: "weekly", priority: 0.88 },
    { path: "/exams/ap", changeFrequency: "weekly", priority: 0.88 },
    { path: "/exams/mcat", changeFrequency: "weekly", priority: 0.84 },
    { path: "/exams/lsat", changeFrequency: "weekly", priority: 0.84 },
    { path: "/exams/nclex", changeFrequency: "weekly", priority: 0.84 },
    { path: "/demo/battle", changeFrequency: "weekly", priority: 0.86 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.78 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.35 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.35 },
    { path: "/classroom", changeFrequency: "weekly", priority: 0.72 },
  ];

  // Deliberately NOT listed: /clashrank and /mastery-map. Both render
  // "Sign in to see..." to a signed-out visitor, so submitting them asks
  // Google to index two near-empty sign-in walls under the site's generic
  // title -- thin content that competes with the pages that do say
  // something. They stay reachable from Settings and Practice; they are
  // just not entry points. /classroom stays because it is a real public
  // page (the schools enquiry form) that reads the same signed out.

  const staticEntries = routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...(await publicDeckEntries())];
}
