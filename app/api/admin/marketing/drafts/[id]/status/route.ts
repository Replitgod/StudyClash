import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

type RouteParams = { params: Promise<{ id: string }> };

// "published" is deliberately excluded here -- that status may only be set
// by app/api/admin/marketing/drafts/[id]/publish/route.ts after a real,
// connected adapter actually confirms success. Every other transition is a
// human decision recorded directly.
const SETTABLE_STATUSES = [
  "approved",
  "needs_editing",
  "submitted_manually",
  "failed",
  "removed",
  "rejected",
  "skipped",
] as const;

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

  const status = typeof body.status === "string" ? body.status : "";
  if (!SETTABLE_STATUSES.includes(status as (typeof SETTABLE_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid or disallowed status." }, { status: 400 });
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };

  if (status === "approved") {
    update.approved_at = new Date().toISOString();
    update.approved_by = admin.userId;
  }
  if (typeof body.moderatorFeedback === "string") update.moderator_feedback = body.moderatorFeedback;
  if (typeof body.publishedUrl === "string") update.published_url = body.publishedUrl;
  if (typeof body.externalPostId === "string") update.external_post_id = body.externalPostId;

  const supabase = getServiceSupabaseClient();
  const { data: draft, error } = await supabase
    .from("marketing_drafts")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "submitted_manually" with a submitted URL is the natural moment to also
  // create the posting-history row, so history and the review queue never
  // drift apart.
  if (status === "submitted_manually") {
    await supabase.from("marketing_publications").insert({
      campaign_id: draft.campaign_id,
      destination_id: draft.destination_id,
      draft_id: draft.id,
      posted_at: new Date().toISOString(),
      submitted_url: typeof body.publishedUrl === "string" ? body.publishedUrl : null,
      post_status: "submitted_manually",
    });

    await supabase
      .from("marketing_destinations")
      .update({ last_posted_date: new Date().toISOString().slice(0, 10), last_result: "submitted_manually" })
      .eq("id", draft.destination_id);
  }

  await logMarketingActivity(admin.userId!, `draft_status_${status}`, "marketing_drafts", id, {
    moderatorFeedback: body.moderatorFeedback,
  });

  return NextResponse.json({ draft });
}
