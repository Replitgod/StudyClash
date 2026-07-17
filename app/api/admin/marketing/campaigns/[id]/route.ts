import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { CAMPAIGN_GOALS, CAMPAIGN_STATUSES, CAMPAIGN_TONES } from "@/lib/server/marketing/constants";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: campaign, error } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: linkedDestinations } = await supabase
    .from("marketing_campaign_destinations")
    .select("*, destination:marketing_destinations(*)")
    .eq("campaign_id", id);

  const { data: drafts } = await supabase
    .from("marketing_drafts")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    campaign,
    linkedDestinations: linkedDestinations || [],
    drafts: drafts || [],
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.goal && !CAMPAIGN_GOALS.includes(body.goal as (typeof CAMPAIGN_GOALS)[number])) {
    return NextResponse.json({ error: "Invalid campaign goal." }, { status: 400 });
  }
  if (body.tone && !CAMPAIGN_TONES.includes(body.tone as (typeof CAMPAIGN_TONES)[number])) {
    return NextResponse.json({ error: "Invalid campaign tone." }, { status: 400 });
  }
  if (body.status && !CAMPAIGN_STATUSES.includes(body.status as (typeof CAMPAIGN_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid campaign status." }, { status: 400 });
  }

  const allowedFields = [
    "name",
    "goal",
    "target_audience",
    "main_message",
    "call_to_action",
    "feature_promoted",
    "tone",
    "launch_date",
    "start_date",
    "end_date",
    "screenshot_urls",
    "video_url",
    "notes",
    "status",
  ];

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field];
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "campaign_updated", "marketing_campaigns", id, update);

  return NextResponse.json({ campaign: data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "campaign_deleted", "marketing_campaigns", id);

  return NextResponse.json({ success: true });
}
