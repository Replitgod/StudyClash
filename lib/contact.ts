// The one place the support address is written down.
//
// It was previously repeated in app/layout.tsx (the Organization schema),
// app/api/enterprise-lead/route.ts and app/components/marketing/SiteFooter.tsx.
// The same copy-paste pattern already caused a real drift once, when a CTA
// advertised Pro at a price the Stripe amount did not match, so anything a
// customer is told to contact or pay lives in exactly one module.
export const CONTACT_EMAIL = "acedecks15@gmail.com";
