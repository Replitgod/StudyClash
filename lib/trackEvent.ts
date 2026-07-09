import { supabase } from "@/lib/supabase";

export type AnalyticsEventName =
  | "page_view"
  | "signup_completed"
  | "login_completed"
  | "deck_create_opened"
  | "deck_generation_started"
  | "deck_generation_success"
  | "deck_generation_failed"
  | "battle_started"
  | "battle_finished"
  | "feedback_submitted"
  | "question_report_submitted"
  | "challenge_link_copied"
  | "challenge_link_copy_failed"
  | "study_resource_opened"
  | "results_rematch_clicked"
  | "results_weak_topics_practice_clicked"
  | "results_create_new_deck_clicked"
  | "results_view_leaderboard_clicked"
  | "results_quick_check_clicked"
  | "results_practice_mode_clicked"
  | "results_rival_battle_clicked"
  | "results_review_missed_clicked"
  | "results_boss_battle_clicked";

// Fire-and-forget analytics logging. This intentionally never throws —
// a failed analytics insert (network hiccup, RLS misconfiguration, etc.)
// should never break the user-facing feature it's attached to. Errors are
// logged to the console for debugging but otherwise swallowed.
export async function trackEvent(
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("analytics_events").insert({
      user_id: user?.id ?? null,
      event_name: eventName,
      page_url:
        typeof window !== "undefined" ? window.location.href : null,
      metadata: metadata ?? null,
    });

    if (error) {
      console.error(`trackEvent("${eventName}") failed:`, error.message);
    }
  } catch (err) {
    console.error(`trackEvent("${eventName}") threw:`, err);
  }
}