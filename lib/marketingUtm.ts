// Shared UTM link builder -- safe to import from client or server code
// (no secrets, no service-role access). The actual tracking_link DB row is
// created server-side (app/api/admin/marketing/tracking-links/route.ts);
// this just builds the URL string itself.

export type UtmParams = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string | null;
};

export function buildTrackingUrl(baseUrl: string, params: UtmParams): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", params.utm_source);
  url.searchParams.set("utm_medium", params.utm_medium);
  url.searchParams.set("utm_campaign", params.utm_campaign);
  if (params.utm_content) {
    url.searchParams.set("utm_content", params.utm_content);
  }
  return url.toString();
}

// Slugifies free-text into a UTM-safe token (lowercase, hyphenated, no
// special characters) -- used for campaign names / destination names /
// draft ids feeding into utm_campaign / utm_source / utm_content.
export function slugifyForUtm(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "value";
}
