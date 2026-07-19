import { NextRequest, NextResponse } from "next/server";
import {
  getAdminEmails,
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { getSiteUrl, getStripeClient, isStripeCheckoutAllowedForEmail } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to manage your subscription." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", auth.userId)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found for your AcedIQ account yet." },
        { status: 400 }
      );
    }

    if (!isStripeCheckoutAllowedForEmail(profile.email, getAdminEmails())) {
      return NextResponse.json(
        { error: "Billing is still being tested and isn't open to the public yet." },
        { status: 403 }
      );
    }

    const stripe = getStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getSiteUrl()}/account`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
  }
}
