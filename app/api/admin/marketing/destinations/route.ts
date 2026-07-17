import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { DESTINATION_PLATFORMS, POSTING_METHODS } from "@/lib/server/marketing/constants";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const platform = request.nextUrl.searchParams.get("platform");
  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
  const search = request.nextUrl.searchParams.get("search");

  let query = supabase.from("marketing_destinations").select("*").order("name", { ascending: true });
  if (platform) query = query.eq("platform", platform);
  if (activeOnly) query = query.eq("active", true);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ destinations: data });
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  const platform = typeof body.platform === "string" ? body.platform : "";
  const destinationType = typeof body.destination_type === "string" ? body.destination_type.trim() : "";

  if (!name) return NextResponse.json({ error: "Destination name is required." }, { status: 400 });
  if (!DESTINATION_PLATFORMS.includes(platform as (typeof DESTINATION_PLATFORMS)[number])) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }
  if (!destinationType) {
    return NextResponse.json({ error: "destination_type is required." }, { status: 400 });
  }

  const postingMethod =
    typeof body.posting_method === "string" && POSTING_METHODS.includes(body.posting_method as (typeof POSTING_METHODS)[number])
      ? body.posting_method
      : "unsupported";

  for (const field of ["submission_url", "homepage_url"] as const) {
    const value = body[field];
    if (typeof value === "string" && value.trim() && !isValidUrl(value.trim())) {
      return NextResponse.json({ error: `${field} must be a valid http(s) URL.` }, { status: 400 });
    }
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_destinations")
    .insert({
      name,
      platform,
      community_or_directory_name:
        typeof body.community_or_directory_name === "string" ? body.community_or_directory_name : null,
      destination_type: destinationType,
      submission_url: typeof body.submission_url === "string" ? body.submission_url : null,
      homepage_url: typeof body.homepage_url === "string" ? body.homepage_url : null,
      posting_method: postingMethod,
      audience: typeof body.audience === "string" ? body.audience : null,
      best_campaign_goals: Array.isArray(body.best_campaign_goals) ? body.best_campaign_goals : [],
      title_limit: typeof body.title_limit === "number" ? body.title_limit : null,
      body_limit: typeof body.body_limit === "number" ? body.body_limit : null,
      media_requirements: typeof body.media_requirements === "string" ? body.media_requirements : null,
      link_restrictions: typeof body.link_restrictions === "string" ? body.link_restrictions : null,
      promotional_rules: typeof body.promotional_rules === "string" ? body.promotional_rules : null,
      self_promotion_allowed: typeof body.self_promotion_allowed === "boolean" ? body.self_promotion_allowed : null,
      allowed_promotion_days: Array.isArray(body.allowed_promotion_days) ? body.allowed_promotion_days : [],
      account_requirements: typeof body.account_requirements === "string" ? body.account_requirements : null,
      min_karma_or_reputation: typeof body.min_karma_or_reputation === "number" ? body.min_karma_or_reputation : null,
      reposting_cooldown_days: typeof body.reposting_cooldown_days === "number" ? body.reposting_cooldown_days : null,
      best_posting_time: typeof body.best_posting_time === "string" ? body.best_posting_time : null,
      api_availability: typeof body.api_availability === "boolean" ? body.api_availability : false,
      manual_review_required: typeof body.manual_review_required === "boolean" ? body.manual_review_required : true,
      last_rules_review_date:
        typeof body.last_rules_review_date === "string" && body.last_rules_review_date
          ? body.last_rules_review_date
          : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      active: typeof body.active === "boolean" ? body.active : true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "destination_created", "marketing_destinations", data.id, { name });

  return NextResponse.json({ destination: data }, { status: 201 });
}
