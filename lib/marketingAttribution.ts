// Captures UTM/campaign attribution from the URL a visitor lands on and
// persists it for the session so later conversion events (signup,
// battle_started, checkout_started, subscription_activated, etc.) can be
// attributed back to the campaign/destination/draft that brought them in.
// Last-touch: a new set of UTM params overwrites the stored ones, matching
// how most lightweight attribution setups behave and keeping this simple.

const STORAGE_KEY = "sc_marketing_attribution";

export type StoredAttribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  campaign_id: string | null;
  destination_id: string | null;
  draft_id: string | null;
  captured_at: string;
};

export function captureAttributionFromUrl(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");
  // Only overwrite stored attribution when this landing actually carries a
  // utm_source -- an internal navigation with no UTM params must not erase
  // attribution captured a few pages earlier in the same session.
  if (!utmSource) return;

  const attribution: StoredAttribution = {
    utm_source: utmSource,
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    campaign_id: params.get("campaign_id"),
    destination_id: params.get("destination_id"),
    draft_id: params.get("draft_id"),
    captured_at: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage unavailable (private browsing, quota) -- attribution is
    // best-effort, never worth breaking the page over.
  }
}

export function getStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAttribution;
  } catch {
    return null;
  }
}
