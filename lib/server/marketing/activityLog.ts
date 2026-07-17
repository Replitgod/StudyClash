import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

// Fire-and-forget audit log for every write the marketing dashboard makes.
// Never throws -- a logging failure must not block the actual admin action.
export async function logMarketingActivity(
  adminUserId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from("marketing_activity_logs").insert({
      admin_user_id: adminUserId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
    if (error) {
      console.error(`marketing activity log failed (${action}):`, error.message);
    }
  } catch (err) {
    console.error(`marketing activity log threw (${action}):`, err);
  }
}
