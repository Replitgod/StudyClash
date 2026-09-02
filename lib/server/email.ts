// Actually sending the mail that has been piling up in
// email_notification_queue.
//
// That table has had producers since 20260709 (a taken crown, an enterprise
// enquiry) and has never had a consumer. Rows went in, `status` stayed
// 'queued' forever, and nobody was ever notified -- the code read as though
// the product emailed people and it did not.
//
// No new dependency: Resend's send endpoint is one POST, and `fetch` is
// already here. Swapping providers means changing `deliver()` and nothing
// else, because everything above it works in terms of a queue row.

export type QueuedEmail = {
  id: string;
  recipient_email: string | null;
  recipient_player_name: string | null;
  event_type: string;
  subject: string;
  body: string;
  action_href: string | null;
};

/** What the queue consumer decided to do with one row. */
export type EmailOutcome =
  | { status: "sent" }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/**
 * Whether this row can be delivered at all, before any network call.
 *
 * Guest players are the case that matters: a battle is playable signed-out,
 * so a `crown_taken` row can carry a display name and no address. There is
 * no one to email and there never will be, so it is failed permanently
 * rather than retried on every cron run forever.
 */
export function classifyRecipient(email: QueuedEmail): EmailOutcome | null {
  const address = email.recipient_email?.trim();
  if (!address) {
    return { status: "failed", reason: "no recipient address on the row" };
  }
  // Deliberately loose. Real validation is the provider's job; this only
  // catches the obviously-unsendable so we don't spend a request on it.
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(address)) {
    return { status: "failed", reason: `unusable address: ${address}` };
  }
  return null;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The queue stores plain text, which is what a person should receive if
 * their client shows the text part. This wraps it for the HTML part.
 *
 * Everything from the row is escaped: `body` and `subject` can contain a
 * player-chosen display name, and a display name is attacker-controlled
 * text. An unescaped one would make every notification an HTML injection
 * into someone else's inbox.
 */
export function renderEmailHtml(email: QueuedEmail): string {
  const paragraphs = email.body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const action = email.action_href
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(absoluteUrl(email.action_href))}" style="display:inline-block;background:#6e56cf;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:12px;font-weight:600">Open AceDecks</a></p>`
    : "";

  return [
    `<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#191625;max-width:520px">`,
    paragraphs,
    action,
    `<p style="margin:32px 0 0;font-size:12px;color:#6f6987">You are getting this because you study with AceDecks. <a href="${SITE_URL}/settings" style="color:#5842ab">Manage your account</a>.</p>`,
    `</div>`,
  ].join("");
}

/** Queue rows store app-relative hrefs; email needs absolute ones. */
export function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${SITE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * One delivery attempt. Returns an outcome rather than throwing, so a single
 * bad row can never take down the batch behind it.
 */
export async function deliver(email: QueuedEmail): Promise<EmailOutcome> {
  const preflight = classifyRecipient(email);
  if (preflight) return preflight;

  if (!isEmailConfigured()) {
    // Not an error, and specifically NOT marked sent: leaving it queued is
    // what lets these go out for real the moment the key is set.
    return { status: "skipped", reason: "RESEND_API_KEY / EMAIL_FROM not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email.recipient_email],
        subject: email.subject,
        text: email.action_href
          ? `${email.body}\n\n${absoluteUrl(email.action_href)}`
          : email.body,
        html: renderEmailHtml(email),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // 4xx is this row's fault and will fail identically forever; 5xx is
      // the provider having a moment and deserves the next run.
      const permanent = response.status >= 400 && response.status < 500;
      return permanent
        ? { status: "failed", reason: `provider rejected (${response.status}): ${detail.slice(0, 200)}` }
        : { status: "skipped", reason: `provider unavailable (${response.status})` };
    }

    return { status: "sent" };
  } catch (error) {
    return {
      status: "skipped",
      reason: error instanceof Error ? error.message : "network error",
    };
  }
}
