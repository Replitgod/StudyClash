import type { PublishingAdapter } from "./types";

// Phase 1 has no real OAuth credentials for any platform, so every adapter
// is this same honest stub: never connected, never fakes a successful
// publish. The dashboard routes every draft through Copy Draft + Open
// Submission Page instead of calling publishPost() at all while this is
// the active adapter -- see app/api/admin/marketing/integrations/route.ts.
export function createManualOnlyAdapter(platform: string): PublishingAdapter {
  return {
    platform,
    async validateConnection() {
      return false;
    },
    async publishPost() {
      return {
        success: false,
        error: `${platform} is not connected. Configure real OAuth credentials in Settings before automatic publishing is available.`,
      };
    },
  };
}
