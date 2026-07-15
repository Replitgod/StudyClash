// Builds the resource_links attached to generated study-plan tasks. Per
// Part 7's cost rules ("don't call OpenAI for every render," "cache
// generated study plans"), this runs ONCE per plan generation -- not per
// task, not on every page view -- and only for a bounded number of the
// weakest topics, each of which already benefits from resourceSearch.ts's
// own 6-hour cache (so two students with the same weak topic don't repeat
// the live search). Topics beyond the bound, or where the live search comes
// back empty, fall back to the deterministic curated catalog rather than
// leaving a task with no links.

import type { SupabaseClient } from "@supabase/supabase-js";
import { findStudyResources } from "@/lib/server/resourceSearch";
import { getCuratedResourcesForTopic, type CuratedResource } from "@/lib/server/curatedResourceCatalog";

const MAX_LIVE_LOOKUPS = 5;

export async function buildLiveResourceCatalog(
  topics: string[],
  supabase: SupabaseClient,
  courseName?: string
): Promise<Record<string, CuratedResource[]>> {
  const uniqueTopics = Array.from(new Set(topics)).filter(Boolean);
  const catalog: Record<string, CuratedResource[]> = {};

  const liveLookupTopics = uniqueTopics.slice(0, MAX_LIVE_LOOKUPS);
  const fallbackTopics = uniqueTopics.slice(MAX_LIVE_LOOKUPS);

  await Promise.all(
    liveLookupTopics.map(async (topic) => {
      try {
        const outcome = await findStudyResources({ topic, courseName }, supabase);
        if (outcome.ok && outcome.resources.length > 0) {
          catalog[topic] = outcome.resources
            .slice(0, 3)
            .map((r) => ({ title: `${r.title} (${r.source})`, url: r.url }));
          return;
        }
      } catch {
        // Live lookup failed (network, rate limit, no API key configured
        // locally) -- fall through to the curated fallback below rather
        // than blocking plan generation on it.
      }
      catalog[topic] = getCuratedResourcesForTopic(topic);
    })
  );

  fallbackTopics.forEach((topic) => {
    catalog[topic] = getCuratedResourcesForTopic(topic);
  });

  return catalog;
}
