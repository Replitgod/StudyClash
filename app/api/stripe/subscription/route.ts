import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

// Informational only -- for deciding whether the account page shows
// "Upgrade to Pro" or "Manage Subscription". Actual Pro access is enforced
// server-side off profiles.plan (see lib/plans.ts PRIORITY_PLAN_IDS), which
// only the verified webhook handler ever writes.
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("status, cancel_at_period_end, current_period_end")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Could not load subscription." }, { status: 500 });
    }

    return NextResponse.json({ subscription: data || null });
  } catch (error) {
    console.error("Stripe subscription status error:", error);
    return NextResponse.json({ error: "Could not load subscription." }, { status: 500 });
  }
}
