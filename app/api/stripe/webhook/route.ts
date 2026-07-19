import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { getStripeClient } from "@/lib/server/stripe";

// Subscription statuses that grant Pro access. Everything else (canceled,
// unpaid, incomplete, incomplete_expired) downgrades the account.
// past_due is included deliberately -- Stripe is still retrying the card,
// and the subscription only reaches canceled/unpaid once retries are
// exhausted, so this is the grace-period window.
const PRO_GRANTING_STATUSES = new Set(["active", "trialing", "past_due"]);

// profiles.plan is also used for manually-granted plans (founder,
// pro_preview, team_pass, and the legacy exam_tunnel). The webhook must
// never overwrite one of those with a Stripe-driven change -- it only ever
// toggles between free_beta and pro_individual, the two plans Stripe
// actually controls.
const STRIPE_MANAGED_PLAN_IDS = new Set(["free_beta", "pro_individual"]);

function extractSubscriptionDetails(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
  };
}

async function resolveUserId(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metadataUserId = subscription.metadata?.supabase_user_id;
  if (metadataUserId) return metadataUserId;

  // Fallback for events where subscription metadata wasn't propagated --
  // look up by the Stripe customer id we saved on the profile at checkout.
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id ?? null;
}

async function syncSubscription(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = await resolveUserId(supabase, subscription);
  if (!userId) {
    console.error("Stripe webhook: could not resolve a AcedIQ user for subscription", subscription.id);
    return;
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { priceId, currentPeriodEnd } = extractSubscriptionDetails(subscription);

  const { error: subUpsertError } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      price_id: priceId,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  // Throwing (instead of swallowing) surfaces the failure as a 500, which
  // makes Stripe automatically retry the webhook delivery -- a silently
  // dropped .upsert()/.update() error here previously meant a paying user's
  // subscription row (or plan grant below) could vanish with zero signal.
  if (subUpsertError) {
    throw new Error(`subscriptions upsert failed: ${subUpsertError.message}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (!profile || !STRIPE_MANAGED_PLAN_IDS.has(profile.plan)) {
    // Leave manually-granted plans (founder, pro_preview, team_pass, the
    // legacy exam_tunnel) alone.
    return;
  }

  const shouldGrantPro = PRO_GRANTING_STATUSES.has(subscription.status);
  const nextPlan = shouldGrantPro ? "pro_individual" : "free_beta";

  if (nextPlan !== profile.plan) {
    const { error: planUpdateError } = await supabase
      .from("profiles")
      .update({ plan: nextPlan })
      .eq("id", userId);
    if (planUpdateError) {
      throw new Error(`profiles.plan update failed (${profile.plan} -> ${nextPlan}): ${planUpdateError.message}`);
    }

    if (nextPlan === "pro_individual") {
      // trackEvent() (lib/trackEvent.ts) uses the browser Supabase client and
      // an active session -- neither exists in a server webhook, so this
      // writes directly with the service client instead.
      await supabase.from("analytics_events").insert({
        user_id: userId,
        event_name: "subscription_activated",
        page_url: null,
        metadata: { subscription_id: subscription.id, status: subscription.status },
      });
    }
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook: STRIPE_WEBHOOK_SECRET is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook: signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(supabase, subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, subscription);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook: failed to process event", event.type, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
