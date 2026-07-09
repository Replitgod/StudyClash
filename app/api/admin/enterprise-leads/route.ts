import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

const ALLOWED_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

async function requireAdmin(request: NextRequest): Promise<{
  ok: boolean;
  userId?: string;
  error?: NextResponse;
}> {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!accessToken) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes((user.email || "").toLowerCase())) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "You do not have admin access." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error as NextResponse;

  const { data, error } = await supabase
    .from("enterprise_leads")
    .select(
      "id, email, organization, role, seats, message, status, source, created_at, updated_at, last_contacted_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load enterprise leads." },
      { status: 500 }
    );
  }

  return NextResponse.json({ leads: data || [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.error as NextResponse;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: LeadStatus;
  };

  const leadId = (body.id || "").trim();
  const nextStatus = body.status;

  if (!leadId || !nextStatus || !ALLOWED_STATUSES.includes(nextStatus)) {
    return NextResponse.json(
      { error: "Lead id and valid status are required." },
      { status: 400 }
    );
  }

  const updates: {
    status: LeadStatus;
    updated_at: string;
    last_contacted_at?: string;
  } = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "contacted") {
    updates.last_contacted_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("enterprise_leads")
    .update(updates)
    .eq("id", leadId)
    .select(
      "id, email, organization, role, seats, message, status, source, created_at, updated_at, last_contacted_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to update lead status." },
      { status: 500 }
    );
  }

  return NextResponse.json({ lead: data });
}
