import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/server/apiUtils";

// Cheap admin-check the /admin/marketing layout calls on every page load to
// decide whether to render anything at all. Never returns ADMIN_EMAILS or
// any other admin-list content -- just a boolean, backed by the same
// requireAdminUser() check every other marketing route independently
// enforces on its own data.
export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ isAdmin: false, error: admin.errorMessage }, { status: admin.errorStatus });
  }

  return NextResponse.json({ isAdmin: true, email: admin.email });
}
