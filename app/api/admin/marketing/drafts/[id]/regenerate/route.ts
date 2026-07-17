import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { generateMarketingDraftContent } from "@/lib/server/marketing/generateDraft";
import { MARKETING_PROFILE_ID, PLATFORM_TO_GENERATOR } from "@/lib/server/marketing/constants";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";
import type { MarketingCampaign, MarketingDestination, MarketingProductProfile } from "@/lib/server/marketing/types";

type RouteParams = { params: Promise<{ id: string }> };

const MODE_GUIDANCE: Record<string, { guidance: string; editType: string }> = {
  regenerate: { guidance: "Write a fresh take, different opening and structure from before.", editType: "regenerated" },
  shorten: { guidance: "Make this significantly shorter and tighter while keeping the key points.", editType: "shortened" },
  more_natural: {
    guidance: "Rewrite so it reads more like a real person casually wrote it -- looser sentence structure, less polished.",
    editType: "more_natural",
  },
  more_engaging: {
    guidance: "Rewrite with a stronger hook and more specific, concrete detail to make it more engaging.",
    editType: "more_engaging",
  },
  less_promotional: {
    guidance: "Rewrite to sound less like marketing and more like a neutral, low-key mention -- reduce any sales language.",
    editType: "less_promotional",
  },
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  let body: { mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = typeof body.mode === "string" ? body.mode : "regenerate";
  const modeConfig = MODE_GUIDANCE[mode];
  if (!modeConfig) {
    return NextResponse.json({ error: "Invalid regeneration mode." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: draft } = await supabase.from("marketing_drafts").select("*").eq("id", id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const [{ data: profile }, { data: campaign }, { data: destination }, { data: trackingLink }] = await Promise.all([
    supabase.from("marketing_product_profile").select("*").eq("id", MARKETING_PROFILE_ID).maybeSingle(),
    supabase.from("marketing_campaigns").select("*").eq("id", draft.campaign_id).maybeSingle(),
    supabase.from("marketing_destinations").select("*").eq("id", draft.destination_id).maybeSingle(),
    draft.tracking_link_fk
      ? supabase.from("marketing_tracking_links").select("full_url").eq("id", draft.tracking_link_fk).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!profile || !campaign || !destination) {
    return NextResponse.json({ error: "Missing profile, campaign, or destination for this draft." }, { status: 400 });
  }

  const generatorType = PLATFORM_TO_GENERATOR[destination.platform as MarketingDestination["platform"]];

  let content;
  try {
    content = await generateMarketingDraftContent({
      generatorType,
      profile: profile as MarketingProductProfile,
      campaign: campaign as MarketingCampaign,
      destination: destination as MarketingDestination,
      trackingUrl: trackingLink?.full_url || process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com",
      avoidBodies: [],
      additionalGuidance: `${modeConfig.guidance}\n\nHere is the previous draft to revise:\nTitle: ${draft.title || "(none)"}\nBody: ${draft.body}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regeneration failed." },
      { status: 502 }
    );
  }

  const { data: updated, error } = await supabase
    .from("marketing_drafts")
    .update({
      title: content.title,
      body: content.body,
      video_script: content.structured,
      hashtags: content.hashtags,
      status: "draft_ready",
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    title: content.title,
    body: content.body,
    video_script: content.structured,
    hashtags: content.hashtags,
    edit_type: modeConfig.editType,
  });

  await logMarketingActivity(admin.userId!, `draft_${modeConfig.editType}`, "marketing_drafts", id);

  return NextResponse.json({ draft: updated });
}
