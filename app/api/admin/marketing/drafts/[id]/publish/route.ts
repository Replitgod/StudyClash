import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { getPublishingAdapter } from "@/lib/server/marketing/adapters";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

type RouteParams = { params: Promise<{ id: string }> };

// Attempts to publish an APPROVED draft through a real, connected official
// API adapter. Requires a second explicit confirmation (body.confirm ===
// true) on top of the draft already being "approved" -- this is the "ask
// for final confirmation" step before anything goes out under the
// founder's name. Every adapter in this codebase is currently a stub that
// reports itself as not connected (see lib/server/marketing/adapters), so
// this route will always return success:false until real OAuth credentials
// are wired up in a later phase -- it must never fabricate a success.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Publishing requires explicit final confirmation (confirm: true)." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();
  const { data: draft } = await supabase
    .from("marketing_drafts")
    .select("*, destination:marketing_destinations(platform, submission_url)")
    .eq("id", id)
    .maybeSingle();

  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.status !== "approved") {
    return NextResponse.json({ error: "Only an approved draft can be published." }, { status: 400 });
  }

  const platform = draft.destination?.platform;
  const adapter = platform ? getPublishingAdapter(platform) : null;

  if (!adapter) {
    return NextResponse.json(
      {
        error: `${platform} has no publishing adapter -- use Copy Draft + Open Submission Page and mark it as submitted manually instead.`,
      },
      { status: 400 }
    );
  }

  const connected = await adapter.validateConnection();
  if (!connected) {
    return NextResponse.json(
      {
        error: `${platform} is not connected to a real account. Automatic publishing is not available -- use Copy Draft + Open Submission Page instead.`,
      },
      { status: 400 }
    );
  }

  const result = await adapter.publishPost({
    title: draft.title || undefined,
    text: draft.body || "",
    mediaUrls: draft.media_urls || [],
  });

  if (!result.success) {
    await supabase.from("marketing_drafts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
    await logMarketingActivity(admin.userId!, "draft_publish_failed", "marketing_drafts", id, { error: result.error });
    return NextResponse.json({ error: result.error || "Publishing failed." }, { status: 502 });
  }

  const { data: updated } = await supabase
    .from("marketing_drafts")
    .update({
      status: "published",
      published_url: result.externalUrl || null,
      external_post_id: result.externalPostId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  await supabase.from("marketing_publications").insert({
    campaign_id: draft.campaign_id,
    destination_id: draft.destination_id,
    draft_id: id,
    posted_at: new Date().toISOString(),
    submitted_url: result.externalUrl || null,
    post_status: "published",
  });

  await logMarketingActivity(admin.userId!, "draft_published", "marketing_drafts", id, {
    externalUrl: result.externalUrl,
  });

  return NextResponse.json({ draft: updated });
}
