import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { logMarketingActivity } from "@/lib/server/marketing/activityLog";

type RouteParams = { params: Promise<{ id: string }> };

const UPDATABLE_FIELDS = [
  "name",
  "platform",
  "community_or_directory_name",
  "destination_type",
  "submission_url",
  "homepage_url",
  "posting_method",
  "audience",
  "best_campaign_goals",
  "title_limit",
  "body_limit",
  "media_requirements",
  "link_restrictions",
  "promotional_rules",
  "self_promotion_allowed",
  "allowed_promotion_days",
  "account_requirements",
  "min_karma_or_reputation",
  "reposting_cooldown_days",
  "best_posting_time",
  "api_availability",
  "manual_review_required",
  "last_rules_review_date",
  "last_posted_date",
  "last_result",
  "notes",
  "active",
];

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.from("marketing_destinations").select("*").eq("id", id).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  return NextResponse.json({ destination: data });
}

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
  for (const field of UPDATABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_destinations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logMarketingActivity(admin.userId!, "destination_updated", "marketing_destinations", id, update);

  return NextResponse.json({ destination: data });
}

// Destinations are deactivated, never hard-deleted -- drafts/publications
// reference them by foreign key and posting history must stay intact.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_destinations")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logMarketingActivity(admin.userId!, "destination_deactivated", "marketing_destinations", id);

  return NextResponse.json({ destination: data });
}
