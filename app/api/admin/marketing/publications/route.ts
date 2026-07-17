import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const destinationId = request.nextUrl.searchParams.get("destinationId");

  let query = supabase
    .from("marketing_publications")
    .select("*, campaign:marketing_campaigns(id, name), destination:marketing_destinations(id, name, platform)")
    .order("posted_at", { ascending: false, nullsFirst: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (destinationId) query = query.eq("destination_id", destinationId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ publications: data });
}

// Creates a manual posting-history record, or updates one with metrics the
// platform's own API/dashboard doesn't expose (views/likes/comments/etc are
// almost always hand-entered here in Phase 1, since no adapter exposes
// analytics yet).
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

  const id = typeof body.id === "string" ? body.id : null;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const destinationId = typeof body.destinationId === "string" ? body.destinationId : "";

  const supabase = getServiceSupabaseClient();

  const numericFields = ["views", "likes", "comments", "clicks", "signUps", "battleCompletions", "paidSubscriptions"];
  const numericColumnMap: Record<string, string> = {
    views: "views",
    likes: "likes",
    comments: "comments",
    clicks: "clicks",
    signUps: "sign_ups",
    battleCompletions: "battle_completions",
    paidSubscriptions: "paid_subscriptions",
  };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of numericFields) {
    if (field in body) {
      const value = body[field];
      if (typeof value !== "number" || value < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number.` }, { status: 400 });
      }
      row[numericColumnMap[field]] = value;
    }
  }
  if (typeof body.draftId === "string") row.draft_id = body.draftId;
  if (typeof body.postedAt === "string") row.posted_at = body.postedAt;
  if (typeof body.submittedUrl === "string") row.submitted_url = body.submittedUrl;
  if (typeof body.postStatus === "string") row.post_status = body.postStatus;
  if (typeof body.removed === "boolean") row.removed = body.removed;
  if (typeof body.removalReason === "string") row.removal_reason = body.removalReason;
  if (typeof body.moderatorFeedback === "string") row.moderator_feedback = body.moderatorFeedback;
  if (typeof body.notes === "string") row.notes = body.notes;

  if (id) {
    const { data, error } = await supabase.from("marketing_publications").update(row).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logMarketingActivity(admin.userId!, "publication_updated", "marketing_publications", id);
    return NextResponse.json({ publication: data });
  }

  if (!campaignId || !destinationId) {
    return NextResponse.json({ error: "campaignId and destinationId are required to create a record." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("marketing_publications")
    .insert({ ...row, campaign_id: campaignId, destination_id: destinationId, posted_at: row.posted_at || new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row.removed) {
    await supabase.from("marketing_destinations").update({ last_result: "removed" }).eq("id", destinationId);
  }

  await logMarketingActivity(admin.userId!, "publication_created", "marketing_publications", data.id);

  return NextResponse.json({ publication: data }, { status: 201 });
}
