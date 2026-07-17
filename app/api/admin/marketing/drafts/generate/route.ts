import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { generateMarketingDraftContent } from "@/lib/server/marketing/generateDraft";
import { MARKETING_PROFILE_ID, PLATFORM_TO_GENERATOR } from "@/lib/server/marketing/constants";
import { buildTrackingUrl, slugifyForUtm } from "@/lib/marketingUtm";
import { findMostSimilarDraft } from "@/lib/server/marketing/similarity";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";
import type { MarketingCampaign, MarketingDestination, MarketingProductProfile } from "@/lib/server/marketing/types";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

// Generates (or regenerates) one draft for one campaign+destination pair.
// Never auto-publishes -- this only ever produces a row with status
// "draft_ready", which sits in the review queue until an admin approves it.
export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  let body: { campaignId?: unknown; destinationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const destinationId = typeof body.destinationId === "string" ? body.destinationId : "";

  if (!campaignId || !destinationId) {
    return NextResponse.json({ error: "campaignId and destinationId are required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const [{ data: profile }, { data: campaign }, { data: destination }] = await Promise.all([
    supabase.from("marketing_product_profile").select("*").eq("id", MARKETING_PROFILE_ID).maybeSingle(),
    supabase.from("marketing_campaigns").select("*").eq("id", campaignId).maybeSingle(),
    supabase.from("marketing_destinations").select("*").eq("id", destinationId).maybeSingle(),
  ]);

  if (!profile) {
    return NextResponse.json(
      { error: "Set up the StudyClash marketing profile first (Settings page)." },
      { status: 400 }
    );
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!destination) {
    return NextResponse.json({ error: "Destination not found." }, { status: 404 });
  }

  const generatorType = PLATFORM_TO_GENERATOR[destination.platform as MarketingDestination["platform"]];

  // Reuse an existing draft row for this campaign+destination if one
  // exists (regeneration), rather than accumulating duplicates.
  const { data: existingDraft } = await supabase
    .from("marketing_drafts")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("destination_id", destinationId)
    .maybeSingle();

  // Tracking link: one per draft, created up front so it can be embedded
  // in the generated content itself.
  const utmSource = slugifyForUtm(destination.name);
  const utmCampaign = slugifyForUtm(campaign.name);
  const utmContent = existingDraft?.id ? slugifyForUtm(existingDraft.id) : undefined;
  const trackingUrl = buildTrackingUrl(siteUrl, {
    utm_source: utmSource,
    utm_medium: destination.platform,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
  });

  // Avoid near-duplicate content across the OTHER destinations already
  // drafted for this campaign.
  const { data: siblingDrafts } = await supabase
    .from("marketing_drafts")
    .select("id, body")
    .eq("campaign_id", campaignId)
    .neq("destination_id", destinationId)
    .not("body", "is", null)
    .limit(10);

  let content;
  try {
    content = await generateMarketingDraftContent({
      generatorType,
      profile: profile as MarketingProductProfile,
      campaign: campaign as MarketingCampaign,
      destination: destination as MarketingDestination,
      trackingUrl,
      avoidBodies: (siblingDrafts || []).map((d) => d.body || ""),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft generation failed." },
      { status: 502 }
    );
  }

  const similarity = findMostSimilarDraft(content.body, siblingDrafts || []);

  const draftRow = {
    campaign_id: campaignId,
    destination_id: destinationId,
    platform: destination.platform,
    content_type: generatorType,
    title: content.title,
    body: content.body,
    video_script: content.structured,
    hashtags: content.hashtags,
    media_urls: [],
    similarity_score: similarity?.score ?? null,
    status: "draft_ready" as const,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let draftId = existingDraft?.id;
  if (draftId) {
    const { error } = await supabase.from("marketing_drafts").update(draftRow).eq("id", draftId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: inserted, error } = await supabase
      .from("marketing_drafts")
      .insert(draftRow)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    draftId = inserted.id;
  }

  // Now that the draft id is known, save the tracking link tied to it.
  const { data: trackingLink } = await supabase
    .from("marketing_tracking_links")
    .insert({
      campaign_id: campaignId,
      destination_id: destinationId,
      draft_id: draftId,
      utm_source: utmSource,
      utm_medium: destination.platform,
      utm_campaign: utmCampaign,
      utm_content: utmContent ?? null,
      full_url: trackingUrl,
    })
    .select("id")
    .single();

  if (trackingLink) {
    await supabase.from("marketing_drafts").update({ tracking_link_fk: trackingLink.id }).eq("id", draftId);
  }

  const { data: nextVersionRow } = await supabase
    .from("marketing_draft_versions")
    .select("version_number")
    .eq("draft_id", draftId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("marketing_draft_versions").insert({
    draft_id: draftId,
    version_number: (nextVersionRow?.version_number || 0) + 1,
    title: content.title,
    body: content.body,
    video_script: content.structured,
    hashtags: content.hashtags,
    edit_type: existingDraft ? "regenerated" : "generated",
  });

  await logMarketingActivity(admin.userId!, "draft_generated", "marketing_drafts", draftId, {
    campaignId,
    destinationId,
  });

  const { data: finalDraft } = await supabase.from("marketing_drafts").select("*").eq("id", draftId).single();

  return NextResponse.json({ draft: finalDraft, trackingUrl });
}
