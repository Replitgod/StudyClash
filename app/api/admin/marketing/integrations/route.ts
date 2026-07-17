import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { DESTINATION_PLATFORMS } from "@/lib/server/marketing/constants";
import { isApiCapablePlatform } from "@/lib/server/marketing/adapters";

// Seeds/reads one row per platform showing real connection status. Never
// returns oauth_token_encrypted -- selected columns are explicit.
export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const supabase = getServiceSupabaseClient();
  const { data: existing, error } = await supabase
    .from("marketing_integrations")
    .select("id, platform, status, connected_account_label, notes, updated_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const existingByPlatform = new Map((existing || []).map((row) => [row.platform, row]));

  const integrations = DESTINATION_PLATFORMS.map((platform) => {
    const row = existingByPlatform.get(platform);
    if (row) return row;
    return {
      id: null,
      platform,
      status: isApiCapablePlatform(platform) ? "not_connected" : "manual_only",
      connected_account_label: null,
      notes: isApiCapablePlatform(platform)
        ? "Official API exists but no OAuth credentials are configured yet."
        : "No realistic official posting API for this destination type -- always manual (Copy Draft + Open Submission Page).",
      updated_at: null,
    };
  });

  return NextResponse.json({ integrations });
}
