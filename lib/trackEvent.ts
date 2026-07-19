import { supabase } from "@/lib/supabase";
import { getStoredAttribution } from "@/lib/marketingAttribution";

export type AnalyticsEventName =
  | "page_view"
  | "signup_completed"
  | "login_completed"
  | "deck_create_opened"
  | "deck_generation_started"
  | "deck_generation_success"
  | "deck_generation_failed"
  | "deck_imported_quizlet"
  | "deck_imported_anki"
  | "battle_started"
  | "battle_finished"
  | "battle_abandoned"
  | "demo_started"
  | "demo_completed"
  | "signup_started"
  | "feedback_submitted"
  | "question_report_submitted"
  | "challenge_link_copied"
  | "challenge_link_copy_failed"
  | "challenge_link_opened"
  | "study_resource_opened"
  | "results_rematch_clicked"
  | "results_weak_topics_practice_clicked"
  | "results_create_new_deck_clicked"
  | "results_view_leaderboard_clicked"
  | "results_quick_check_clicked"
  | "results_practice_mode_clicked"
  | "results_rival_battle_clicked"
  | "results_review_missed_clicked"
  | "results_boss_battle_clicked"
  | "results_challenge_friend_clicked"
  | "results_return_to_dashboard_clicked"
  | "classroom_room_created"
  | "classroom_invite_copied"
  | "classroom_join_attempted"
  | "classroom_join_success"
  | "classroom_join_failed"
  | "enterprise_lead_submitted"
  | "enterprise_lead_submit_failed"
  | "diagnostic_viewed"
  | "diagnostic_started"
  | "diagnostic_module_completed"
  | "diagnostic_completed"
  | "diagnostic_abandoned"
  | "diagnostic_results_viewed"
  | "diagnostic_retake_started"
  | "study_plan_created"
  | "study_plan_task_completed"
  | "study_plan_rescheduled"
  | "upcoming_assessment_added"
  | "recommended_resource_clicked"
  | "homepage_viewed"
  | "pricing_viewed"
  | "instant_demo_started"
  | "checkout_started"
  // Written directly via the service-role client from app/api/stripe/webhook
  // (server-side, no browser session to call trackEvent() with) -- listed
  // here so the catalog stays the single source of truth for event names.
  | "subscription_activated"
  | "curriculum_course_created"
  | "curriculum_document_uploaded"
  | "diagnostic_tutor_action_clicked"
  | "diagnostic_retry_weak_topics_clicked";

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

  // Dual-write into marketing_events when this visitor's session carries
  // stored campaign attribution (see lib/marketingAttribution.ts) -- lets
  // the marketing dashboard attribute real product events (signups,
  // battles, checkouts, subscriptions) back to a campaign/destination/draft
  // without AcedIQ's core analytics pipeline knowing marketing exists.
  // Fire-and-forget, same as the write above -- never blocks or throws.
  const attribution = getStoredAttribution();
  if (attribution) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("marketing_events").insert({
        event_name: eventName,
        user_id: user?.id ?? null,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        campaign_id: attribution.campaign_id,
        destination_id: attribution.destination_id,
        draft_id: attribution.draft_id,
        metadata: metadata ?? null,
      });
    } catch (err) {
      console.error(`marketing_events dual-write for "${eventName}" threw:`, err);
    }
  }
}