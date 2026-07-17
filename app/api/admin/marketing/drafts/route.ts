import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const status = request.nextUrl.searchParams.get("status");
  const platform = request.nextUrl.searchParams.get("platform");

  let query = supabase
    .from("marketing_drafts")
    .select("*, campaign:marketing_campaigns(id, name, goal), destination:marketing_destinations(id, name, platform, submission_url, homepage_url, promotional_rules, self_promotion_allowed, manual_review_required, last_rules_review_date)")
    .order("updated_at", { ascending: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (status) query = query.eq("status", status);
  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ drafts: data });
}
