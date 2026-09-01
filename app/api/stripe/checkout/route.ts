import { NextRequest, NextResponse } from "next/server";
import {
  getAdminEmails,
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import {
  getSiteUrl,
  getStripeClient,
  isStripeCheckoutAllowedForEmail,
  isStripeTestMode,
} from "@/lib/server/stripe";
import { getTierPrice, TIERS, type BillingInterval } from "@/lib/tiers";

// Subscription statuses that mean "this user already has a AceDecks Pro
// subscription in flight" -- checkout is blocked while one of these exists
// so a user can never end up with two live Stripe subscriptions.
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

const TEST_MODE_MESSAGE =
  "AceDecks Pro checkout is still being tested and isn't open to the public yet.";

// Lets the pricing/account pages ask "should I even show the checkout
// button?" before the user clicks anything -- avoids showing a live "Upgrade
// to Pro" CTA to every visitor while Stripe is still in test mode.
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", auth.userId)
      .single();

    const available = isStripeCheckoutAllowedForEmail(profile?.email, getAdminEmails());
    return NextResponse.json({ available, testMode: isStripeTestMode() });
  } catch (error) {
    console.error("Stripe checkout availability error:", error);
    return NextResponse.json({ available: false, testMode: isStripeTestMode() });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to upgrade to Pro." }, { status: 401 });
  }

  // Which interval the customer picked. Anything other than "year" is
  // treated as monthly, so a malformed body cannot land someone on a plan
  // they did not choose -- and never a price id supplied by the client,
  // which would let a caller buy any price in the Stripe account.
  const body = await request.json().catch(() => null);
  const interval: BillingInterval =
    body && typeof body === "object" && (body as { interval?: unknown }).interval === "year"
      ? "year"
      : "month";

  const tierPrice = getTierPrice(TIERS.pro, interval);
  if (!tierPrice) {
    return NextResponse.json({ error: "That plan is not available." }, { status: 400 });
  }

  const priceId = process.env[tierPrice.stripePriceEnvVar];
  if (!priceId) {
    // A missing annual price id must not silently fall back to the monthly
    // one: the customer chose a yearly plan and would be charged $9.99 a
    // month instead.
    console.error(
      `Stripe checkout: ${tierPrice.stripePriceEnvVar} is not set, so the ${interval}ly Ace Pro price cannot be sold.`
    );
    return NextResponse.json({ error: "Checkout is not configured." }, { status: 500 });
  }

  try {
    const supabase = getServiceSupabaseClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", auth.userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Could not load your account." }, { status: 500 });
    }

    if (!isStripeCheckoutAllowedForEmail(profile.email, getAdminEmails())) {
      return NextResponse.json({ error: TEST_MODE_MESSAGE }, { status: 403 });
    }

    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (existingSubscription && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
      return NextResponse.json(
        { error: "You already have an active AceDecks Pro subscription." },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    let customerId = profile.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || undefined,
        metadata: { supabase_user_id: auth.userId },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", auth.userId);
    }

    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: auth.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { supabase_user_id: auth.userId, billing_interval: interval },
      },
      // Both of these must be routes that actually exist. They used to
      // point at /account, a page removed in the four-destinations
      // redesign, so every customer who completed a payment was handed a
      // 404 as their receipt. Billing now lives in Settings.
      success_url: `${siteUrl}/settings?checkout=success`,
      cancel_url: `${siteUrl}/pricing?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
