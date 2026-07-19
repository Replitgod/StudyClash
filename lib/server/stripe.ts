import Stripe from "stripe";

let cachedStripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe is not configured.");
  }

  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey);
  }

  return cachedStripeClient;
}

// Same fallback convention used across the app (layout.tsx, sitemap.ts,
// etc.) for building absolute URLs.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://acediq.com";
}

// True whenever STRIPE_SECRET_KEY is a test-mode key (sk_test_...). Used to
// keep checkout/billing-portal restricted to admin accounts until the repo
// is switched to a live secret key -- no separate flag to remember to flip,
// swapping the env var to sk_live_... automatically opens checkout to
// everyone.
export function isStripeTestMode(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  return secretKey.startsWith("sk_test_");
}

// While Stripe is in test mode, only ADMIN_EMAILS accounts (the same list
// that gates the admin panel) may reach checkout/billing-portal -- everyone
// else must not be able to trigger a live Checkout Session against test
// keys from a public marketing page. Once STRIPE_SECRET_KEY is a live key,
// this always returns true.
export function isStripeCheckoutAllowedForEmail(
  email: string | null | undefined,
  adminEmails: string[]
): boolean {
  if (!isStripeTestMode()) return true;
  return !!email && adminEmails.includes(email.toLowerCase());
}
