import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

// Single place every pipeline stage enqueues its "next stage" job from --
// relies on processing_jobs_one_active_per_stage (see
// 20260725_curriculum_engine_schema_phase1.sql) to make this a true no-op
// if a job for this (course, document, job_type) is already
// queued/running, rather than every call site needing to remember to
// check first ("avoid duplicate work", Section 9).
export async function enqueueJob(args: {
  courseId: string;
  jobType: string;
  documentId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("processing_jobs").insert({
    course_id: args.courseId,
    document_id: args.documentId ?? null,
    job_type: args.jobType,
    status: "queued",
    payload: args.payload ?? {},
  });

  // 23505 = unique_violation -- exactly the "already an active job for
  // this stage" case the partial unique index exists to catch. Anything
  // else is a real error worth surfacing.
  if (error && error.code !== "23505") {
    throw new Error(`Failed to enqueue ${args.jobType} job: ${error.message}`);
  }
}
