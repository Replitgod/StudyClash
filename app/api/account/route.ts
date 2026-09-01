import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { getStripeClient } from "@/lib/server/stripe";

// Self-service account deletion.
//
// Until this existed the privacy policy told students to email us and wait
// for a manual deletion, which is not a serious answer for a product that
// stores school material and takes card payments.
//
// Order matters here and is deliberate:
//
//  1. Cancel any live Stripe subscription FIRST. Deleting the account while
//     a subscription is still open would keep charging a card belonging to
//     someone who no longer has an account and cannot reach the billing
//     portal to stop it.
//  2. Delete the rows whose cascade behaviour this repo cannot vouch for
//     (`decks`/`questions` predate supabase/migrations, exactly as noted in
//     app/api/library/material/route.ts).
//  3. Delete the auth user last. Every table added since 20260711 declares
//     `references auth.users(id) on delete cascade` for owned rows and
//     `on delete set null` for references to a person, so this one call
//     clears the rest and correctly anonymises shared history (match rows,
//     tournament brackets) rather than punching holes in it.
//
// Step 3 is the point of no return, so a failure in 1 or 2 stops the whole
// thing and reports it, rather than half-deleting an account.

export const runtime = "nodejs";

const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
]);

type CancelOutcome = { ok: boolean; message: string | null };

async function cancelActiveSubscription(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string
): Promise<CancelOutcome> {
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  const subscriptionId: string | null = subscription?.stripe_subscription_id ?? null;
  const status: string = subscription?.status ?? "";

  if (!subscriptionId || !LIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return { ok: true, message: null };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    // A live subscription we cannot reach Stripe to cancel. Refusing is the
    // safe failure: the alternative bills a deleted account indefinitely.
    return {
      ok: false,
      message:
        "We could not reach billing to cancel your subscription. Please cancel it first, or contact support.",
    };
  }

  try {
    await getStripeClient().subscriptions.cancel(subscriptionId);
    return { ok: true, message: null };
  } catch (error) {
    // Already cancelled or already gone at Stripe's end is not a failure.
    const code = (error as { code?: string })?.code;
    if (code === "resource_missing") return { ok: true, message: null };

    console.error("Account deletion: could not cancel subscription", subscriptionId, error);
    return {
      ok: false,
      message:
        "We could not cancel your subscription automatically. Please cancel it in the billing portal first.",
    };
  }
}

export async function DELETE(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  const cancelled = await cancelActiveSubscription(supabase, userId);
  if (!cancelled.ok) {
    return NextResponse.json({ error: cancelled.message }, { status: 409 });
  }

  // Questions hang off decks, and neither table's cascade is guaranteed.
  const { data: decks } = await supabase.from("decks").select("id").eq("user_id", userId);
  const deckIds = (decks || []).map((deck) => deck.id as string);

  if (deckIds.length > 0) {
    await supabase.from("questions").delete().in("deck_id", deckIds);
    const { error: deckError } = await supabase.from("decks").delete().eq("user_id", userId);
    if (deckError) {
      console.error("Account deletion: could not delete decks for", userId, deckError.message);
      return NextResponse.json(
        { error: "Could not delete your study material. Nothing was removed — please try again." },
        { status: 500 }
      );
    }
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Account deletion: could not delete auth user", userId, authError.message);
    return NextResponse.json(
      { error: "Could not finish deleting your account. Please contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
