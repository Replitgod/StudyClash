import { NextRequest, NextResponse } from "next/server";
import {
  checkInMemoryRateLimit,
  getBearerToken,
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
} from "@/lib/server/apiUtils";

type EnterpriseLeadPayload = {
  email?: string;
  organization?: string;
  role?: string;
  seats?: string;
  message?: string;
};

const supabase = getServiceSupabaseClient();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const ip = getClientIpAddress(req);
  const ipHash = hashIdentifier(ip);
  const rateLimit = checkInMemoryRateLimit({
    key: `enterprise-lead:${ipHash}`,
    limit: 6,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again in a minute." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let body: EnterpriseLeadPayload = {};
  try {
    body = (await req.json()) as EnterpriseLeadPayload;
  } catch {
    body = {};
  }

  const email = (body.email || "").trim().toLowerCase();
  const organization = (body.organization || "").trim().slice(0, 120);
  const role = (body.role || "").trim().slice(0, 80);
  const seats = (body.seats || "").trim().slice(0, 40);
  const message = (body.message || "").trim().slice(0, 1200);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid work email is required." }, { status: 400 });
  }

  if (!organization) {
    return NextResponse.json({ error: "Organization is required." }, { status: 400 });
  }

  const formattedBody = [
    `Organization: ${organization}`,
    role ? `Role: ${role}` : null,
    seats ? `Seats: ${seats}` : null,
    message ? `Notes: ${message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const token = getBearerToken(req);

  let submitterUserId: string | null = null;
  if (token) {
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    submitterUserId = user?.id || null;
  }

  const { error: leadError } = await supabase.from("enterprise_leads").insert({
    submitter_user_id: submitterUserId,
    email,
    organization,
    role: role || null,
    seats: seats || null,
    message: message || null,
    source: "classroom_page",
  });

  if (leadError) {
    return NextResponse.json({ error: "Could not submit lead form." }, { status: 500 });
  }

  await supabase.from("email_notification_queue").insert({
    recipient_email: "founders@studyjoust.app",
    event_type: "enterprise_lead",
    subject: `Enterprise pilot lead from ${organization}`,
    body: `Lead Email: ${email}\n${formattedBody}`,
    metadata: {
      leadEmail: email,
      organization,
      role,
      seats,
    },
  });

  return NextResponse.json({ ok: true });
}
