import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type EnterpriseLeadPayload = {
  email?: string;
  organization?: string;
  role?: string;
  seats?: string;
  message?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
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

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

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
    recipient_email: "founders@studyclash.app",
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
