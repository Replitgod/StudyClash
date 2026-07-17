import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { CAMPAIGN_GOALS, CAMPAIGN_STATUSES, CAMPAIGN_TONES } from "@/lib/server/marketing/constants";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const status = request.nextUrl.searchParams.get("status");
  const goal = request.nextUrl.searchParams.get("goal");

  let query = supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (goal) query = query.eq("goal", goal);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const goal = typeof body.goal === "string" ? body.goal : "";

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
  }
  if (!CAMPAIGN_GOALS.includes(goal as (typeof CAMPAIGN_GOALS)[number])) {
    return NextResponse.json({ error: "Invalid campaign goal." }, { status: 400 });
  }
  if (body.tone && !CAMPAIGN_TONES.includes(body.tone as (typeof CAMPAIGN_TONES)[number])) {
    return NextResponse.json({ error: "Invalid campaign tone." }, { status: 400 });
  }
  if (body.status && !CAMPAIGN_STATUSES.includes(body.status as (typeof CAMPAIGN_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid campaign status." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      name,
      goal,
      target_audience: typeof body.target_audience === "string" ? body.target_audience : null,
      main_message: typeof body.main_message === "string" ? body.main_message : null,
      call_to_action: typeof body.call_to_action === "string" ? body.call_to_action : null,
      feature_promoted: typeof body.feature_promoted === "string" ? body.feature_promoted : null,
      tone: typeof body.tone === "string" ? body.tone : null,
      launch_date: typeof body.launch_date === "string" && body.launch_date ? body.launch_date : null,
      start_date: typeof body.start_date === "string" && body.start_date ? body.start_date : null,
      end_date: typeof body.end_date === "string" && body.end_date ? body.end_date : null,
      screenshot_urls: Array.isArray(body.screenshot_urls) ? body.screenshot_urls : [],
      video_url: typeof body.video_url === "string" ? body.video_url : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      status: typeof body.status === "string" ? body.status : "draft",
      created_by: admin.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "campaign_created", "marketing_campaigns", data.id, { name });

  return NextResponse.json({ campaign: data }, { status: 201 });
}
