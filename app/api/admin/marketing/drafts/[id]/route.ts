import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: draft, error } = await supabase
    .from("marketing_drafts")
    .select("*, campaign:marketing_campaigns(*), destination:marketing_destinations(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const { data: versions } = await supabase
    .from("marketing_draft_versions")
    .select("*")
    .eq("draft_id", id)
    .order("version_number", { ascending: false });

  const { data: trackingLink } = draft.tracking_link_fk
    ? await supabase.from("marketing_tracking_links").select("*").eq("id", draft.tracking_link_fk).maybeSingle()
    : { data: null };

  return NextResponse.json({ draft, versions: versions || [], trackingLink });
}

// Manual edits to a draft's content (the "Edit" action in the review queue).
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

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of ["title", "body", "hashtags", "video_script", "media_urls"]) {
    if (field in body) update[field] = body[field];
  }

  // A manual body/title edit means the content is no longer exactly what
  // was AI-generated -- move it out of "draft_ready" so it's visibly
  // distinct in the queue until it's re-approved, unless the admin is
  // explicitly setting a status themselves in the same request.
  if (("title" in body || "body" in body) && !("status" in body)) {
    update.status = "needs_editing";
  }
  if ("status" in body) update.status = body.status;

  const supabase = getServiceSupabaseClient();
  const { data: updated, error } = await supabase
    .from("marketing_drafts")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ("title" in body || "body" in body) {
    const { data: nextVersionRow } = await supabase
      .from("marketing_draft_versions")
      .select("version_number")
      .eq("draft_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("marketing_draft_versions").insert({
      draft_id: id,
      version_number: (nextVersionRow?.version_number || 0) + 1,
      title: updated.title,
      body: updated.body,
      video_script: updated.video_script,
      hashtags: updated.hashtags,
      edit_type: "manual_edit",
    });
  }

  await logMarketingActivity(admin.userId!, "draft_edited", "marketing_drafts", id);

  return NextResponse.json({ draft: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("marketing_drafts").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logMarketingActivity(admin.userId!, "draft_deleted", "marketing_drafts", id);

  return NextResponse.json({ success: true });
}
