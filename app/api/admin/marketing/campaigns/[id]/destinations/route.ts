import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { recommendDestinations } from "@/lib/server/marketing/recommendations";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";
import type { MarketingCampaign, MarketingDestination } from "@/lib/server/marketing/types";

type RouteParams = { params: Promise<{ id: string }> };

// Returns every active destination scored/explained for this campaign --
// the recommendation queue the campaign detail page renders.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: destinations, error: destinationsError } = await supabase
    .from("marketing_destinations")
    .select("*");

  if (destinationsError) {
    return NextResponse.json({ error: destinationsError.message }, { status: 500 });
  }

  const recommendations = recommendDestinations(
    campaign as MarketingCampaign,
    (destinations || []) as MarketingDestination[]
  );

  return NextResponse.json({ recommendations });
}

// Links one or more destinations to a campaign (creates
// marketing_campaign_destinations rows). Body: { destinationIds: string[] }
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  let body: { destinationIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const destinationIds = Array.isArray(body.destinationIds)
    ? body.destinationIds.filter((value): value is string => typeof value === "string")
    : [];

  if (destinationIds.length === 0) {
    return NextResponse.json({ error: "destinationIds must be a non-empty array." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  const rows = destinationIds.map((destinationId) => ({
    campaign_id: id,
    destination_id: destinationId,
  }));

  const { data, error } = await supabase
    .from("marketing_campaign_destinations")
    .upsert(rows, { onConflict: "campaign_id,destination_id", ignoreDuplicates: true })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "campaign_destinations_linked", "marketing_campaigns", id, {
    destinationIds,
  });

  return NextResponse.json({ linked: data });
}
