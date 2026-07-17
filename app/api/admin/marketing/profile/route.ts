import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { MARKETING_PROFILE_ID } from "@/lib/server/marketing/constants";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_product_profile")
    .select("*")
    .eq("id", MARKETING_PROFILE_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

const ARRAY_FIELDS = ["main_features", "unique_advantages", "screenshots", "demo_videos"] as const;
const TEXT_FIELDS = [
  "product_name",
  "website_url",
  "tagline",
  "short_description",
  "long_description",
  "target_users",
  "main_problem_solved",
  "free_plan_details",
  "pro_details",
  "current_pricing",
  "beta_status",
  "founder_story",
  "founder_age_or_student_status",
  "logo_url",
  "support_email",
  "privacy_policy_url",
  "terms_url",
  "preferred_cta",
] as const;

export async function PUT(request: NextRequest) {
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

  const update: Record<string, unknown> = {
    id: MARKETING_PROFILE_ID,
    updated_at: new Date().toISOString(),
    updated_by: admin.userId,
  };

  for (const field of TEXT_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (value !== null && typeof value !== "string") {
        return NextResponse.json({ error: `${field} must be a string.` }, { status: 400 });
      }
      update[field] = value;
    }
  }

  for (const field of ARRAY_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        return NextResponse.json({ error: `${field} must be an array of strings.` }, { status: 400 });
      }
      update[field] = value;
    }
  }

  if ("social_links" in body) {
    if (typeof body.social_links !== "object" || body.social_links === null || Array.isArray(body.social_links)) {
      return NextResponse.json({ error: "social_links must be an object." }, { status: 400 });
    }
    update.social_links = body.social_links;
  }

  if ("verified_usage_stats" in body) {
    if (
      typeof body.verified_usage_stats !== "object" ||
      body.verified_usage_stats === null ||
      Array.isArray(body.verified_usage_stats)
    ) {
      return NextResponse.json({ error: "verified_usage_stats must be an object." }, { status: 400 });
    }
    update.verified_usage_stats = body.verified_usage_stats;
  }

  for (const [key, value] of Object.entries(update)) {
    if (typeof value === "string" && ["website_url", "logo_url", "privacy_policy_url", "terms_url"].includes(key)) {
      if (value.trim() && !/^https?:\/\//i.test(value.trim())) {
        return NextResponse.json({ error: `${key} must be a valid http(s) URL.` }, { status: 400 });
      }
    }
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_product_profile")
    .upsert(update, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logMarketingActivity(admin.userId!, "profile_updated", "marketing_product_profile", MARKETING_PROFILE_ID);

  return NextResponse.json({ profile: data });
}
