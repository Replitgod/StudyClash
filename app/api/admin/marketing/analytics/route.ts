import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";

const FUNNEL_EVENT_NAMES = [
  "page_view",
  "signup_completed",
  "battle_started",
  "battle_finished",
  "feedback_submitted",
  "pricing_viewed",
  "checkout_started",
  "subscription_activated",
] as const;

type EventRow = {
  event_name: string;
  campaign_id: string | null;
  destination_id: string | null;
  draft_id: string | null;
  utm_source: string | null;
  created_at: string;
};

function countBy<T extends string>(rows: EventRow[], key: (row: EventRow) => T | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function conversionRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const platform = request.nextUrl.searchParams.get("platform");
  const destinationId = request.nextUrl.searchParams.get("destinationId");

  let eventsQuery = supabase
    .from("marketing_events")
    .select("event_name, campaign_id, destination_id, draft_id, utm_source, created_at")
    .in("event_name", FUNNEL_EVENT_NAMES as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(20000);

  if (startDate) eventsQuery = eventsQuery.gte("created_at", startDate);
  if (endDate) eventsQuery = eventsQuery.lte("created_at", endDate);
  if (campaignId) eventsQuery = eventsQuery.eq("campaign_id", campaignId);
  if (destinationId) eventsQuery = eventsQuery.eq("destination_id", destinationId);

  const [{ data: events, error: eventsError }, { data: campaigns }, { data: destinations }, { data: drafts }, { data: publications }] =
    await Promise.all([
      eventsQuery,
      supabase.from("marketing_campaigns").select("id, name, status"),
      supabase.from("marketing_destinations").select("id, name, platform"),
      supabase.from("marketing_drafts").select("id, status, campaign_id, destination_id, title"),
      supabase.from("marketing_publications").select("*"),
    ]);

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const destinationById = new Map((destinations || []).map((d) => [d.id, d]));
  const campaignById = new Map((campaigns || []).map((c) => [c.id, c]));

  let rows = (events || []) as EventRow[];
  if (platform) {
    const destinationIdsForPlatform = new Set(
      (destinations || []).filter((d) => d.platform === platform).map((d) => d.id)
    );
    rows = rows.filter((row) => row.destination_id && destinationIdsForPlatform.has(row.destination_id));
  }

  const countByEvent = (name: string) => rows.filter((row) => row.event_name === name).length;

  const funnel = {
    visitors: countByEvent("page_view"),
    signUps: countByEvent("signup_completed"),
    battleStarts: countByEvent("battle_started"),
    battleCompletions: countByEvent("battle_finished"),
    pricingViews: countByEvent("pricing_viewed"),
    checkoutStarts: countByEvent("checkout_started"),
    paidSubscriptions: countByEvent("subscription_activated"),
  };

  const funnelWithRates = {
    ...funnel,
    rates: {
      visitorsToSignUps: conversionRate(funnel.signUps, funnel.visitors),
      signUpsToBattleStarts: conversionRate(funnel.battleStarts, funnel.signUps),
      battleStartsToCompletions: conversionRate(funnel.battleCompletions, funnel.battleStarts),
      battleCompletionsToPricingViews: conversionRate(funnel.pricingViews, funnel.battleCompletions),
      pricingViewsToCheckoutStarts: conversionRate(funnel.checkoutStarts, funnel.pricingViews),
      checkoutStartsToPaidSubscriptions: conversionRate(funnel.paidSubscriptions, funnel.checkoutStarts),
      overallVisitorsToPaid: conversionRate(funnel.paidSubscriptions, funnel.visitors),
    },
  };

  // Platform/destination/campaign breakdowns
  const byPlatformCounts: Record<string, { visitors: number; signUps: number; paidSubscriptions: number }> = {};
  const byDestinationCounts: Record<string, { visitors: number; signUps: number; paidSubscriptions: number }> = {};
  const byCampaignCounts: Record<string, { visitors: number; signUps: number; paidSubscriptions: number }> = {};

  for (const row of rows) {
    const destination = row.destination_id ? destinationById.get(row.destination_id) : null;
    const platformKey = destination?.platform || "unknown";
    const destinationKey = row.destination_id || "unknown";
    const campaignKey = row.campaign_id || "unknown";

    for (const [bucket, key] of [
      [byPlatformCounts, platformKey],
      [byDestinationCounts, destinationKey],
      [byCampaignCounts, campaignKey],
    ] as const) {
      if (!bucket[key]) bucket[key] = { visitors: 0, signUps: 0, paidSubscriptions: 0 };
      if (row.event_name === "page_view") bucket[key].visitors += 1;
      if (row.event_name === "signup_completed") bucket[key].signUps += 1;
      if (row.event_name === "subscription_activated") bucket[key].paidSubscriptions += 1;
    }
  }

  const byPlatform = Object.entries(byPlatformCounts)
    .map(([platformName, counts]) => ({ platform: platformName, ...counts }))
    .sort((a, b) => b.visitors - a.visitors);

  const byDestination = Object.entries(byDestinationCounts)
    .map(([destinationIdKey, counts]) => ({
      destinationId: destinationIdKey,
      destinationName: destinationById.get(destinationIdKey)?.name || "Unknown",
      ...counts,
    }))
    .sort((a, b) => b.visitors - a.visitors);

  const byCampaign = Object.entries(byCampaignCounts)
    .map(([campaignIdKey, counts]) => ({
      campaignId: campaignIdKey,
      campaignName: campaignById.get(campaignIdKey)?.name || "Unknown",
      ...counts,
    }))
    .sort((a, b) => b.visitors - a.visitors);

  const bestPlatform = byPlatform.find((p) => p.visitors > 0) || null;
  const bestCampaign = byCampaign.find((c) => c.paidSubscriptions > 0) || byCampaign[0] || null;

  const destinationsWithNoConversions = byDestination.filter((d) => d.visitors > 0 && d.signUps === 0);

  const draftCounts = countBy(
    (drafts || []).map((d) => ({ event_name: d.status, campaign_id: null, destination_id: null, draft_id: null, utm_source: null, created_at: "" })),
    (row) => row.event_name
  );

  const summary = {
    totalCampaigns: campaigns?.length || 0,
    draftsWaitingReview: draftCounts["draft_ready"] || 0,
    postsPublished: draftCounts["published"] || 0,
    manualSubmissionsCompleted: draftCounts["submitted_manually"] || 0,
    visitors: funnel.visitors,
    signUps: funnel.signUps,
    battlesStarted: funnel.battleStarts,
    battlesCompleted: funnel.battleCompletions,
    feedbackSubmissions: countByEvent("feedback_submitted"),
    pricingViews: funnel.pricingViews,
    checkoutStarts: funnel.checkoutStarts,
    paidSubscriptions: funnel.paidSubscriptions,
    bestPerformingPlatform: bestPlatform?.platform || null,
    bestPerformingCampaign: bestCampaign?.campaignName || null,
  };

  return NextResponse.json({
    summary,
    funnel: funnelWithRates,
    byPlatform,
    byDestination,
    byCampaign,
    destinationsWithNoConversions,
    publications: publications || [],
  });
}
