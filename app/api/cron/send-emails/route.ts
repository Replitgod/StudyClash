import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/server/apiUtils";
import { drainEmailQueue } from "@/lib/server/emailQueue";

// Manual/extra trigger for the email queue.
//
// NOT in vercel.json: Vercel's Hobby plan allows only two cron jobs and
// this app already uses both, so a third entry is a deployment error rather
// than a third job. The drain runs at the end of /api/cron/srs-reviews,
// which is what queues most of the mail anyway. This route stays for
// triggering a send by hand, and to wire up as its own schedule the moment
// the project has a spare cron slot.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await drainEmailQueue());
}
