import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { buildTrackingUrl, slugifyForUtm } from "@/lib/marketingUtm";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const campaignId = request.nextUrl.searchParams.get("campaignId");

  let query = supabase.from("marketing_tracking_links").select("*").order("created_at", { ascending: false });
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trackingLinks: data });
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

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
  const destinationId = typeof body.destinationId === "string" ? body.destinationId : null;
  const draftId = typeof body.draftId === "string" ? body.draftId : null;
  const utmSource = typeof body.utmSource === "string" ? slugifyForUtm(body.utmSource) : "";
  const utmMedium = typeof body.utmMedium === "string" ? slugifyForUtm(body.utmMedium) : "community";
  const utmCampaign = typeof body.utmCampaign === "string" ? slugifyForUtm(body.utmCampaign) : "";
  const utmContent = typeof body.utmContent === "string" ? slugifyForUtm(body.utmContent) : null;

  if (!utmSource || !utmCampaign) {
    return NextResponse.json({ error: "utmSource and utmCampaign are required." }, { status: 400 });
  }

  const fullUrl = buildTrackingUrl(siteUrl, {
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
  });

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_tracking_links")
    .insert({
      campaign_id: campaignId,
      destination_id: destinationId,
      draft_id: draftId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      full_url: fullUrl,
      short_label: typeof body.shortLabel === "string" ? body.shortLabel : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trackingLink: data }, { status: 201 });
}
