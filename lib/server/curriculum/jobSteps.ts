import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

// One row per dispatcher invocation attempt for a job (Section 9:
// processing_job_steps exists for "debugging/audit rather than only
// keeping the job's final status" -- see the table comment in
// 20260725_curriculum_engine_schema_phase1.sql). step_order = the job's
// attempt number at the time of this call, which is already a monotonic
// per-job counter the dispatcher increments before invoking a handler --
// reusing it here satisfies processing_job_steps' (job_id, step_order)
// uniqueness for free, no extra query needed. This is coarser than the
// ideal "one row per named sub-stage" (e.g. question_verification's own
// source_grounding/answer_verification/... chain, which already gets that
// granularity for free via question_reviews) -- good enough for "why did
// this job stall/fail" debugging without touching all eight handler files.
export async function recordJobStep(args: {
  jobId: string;
  stepOrder: number;
  stepName: string;
  status: "completed" | "failed";
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("processing_job_steps").insert({
    job_id: args.jobId,
    step_order: args.stepOrder,
    step_name: args.stepName,
    status: args.status,
    attempt_count: 1,
    input: args.input ?? null,
    output: args.output ?? null,
    error_message: args.errorMessage ?? null,
    started_at: now,
    completed_at: now,
  });

  // Audit logging must never take down the job it's logging -- a failed
  // insert here (e.g. a duplicate step_order from a racing retry) is worth
  // knowing about but not worth failing the pipeline over.
  if (error) console.error(`Failed to record job step for job ${args.jobId}: ${error.message}`);
}
