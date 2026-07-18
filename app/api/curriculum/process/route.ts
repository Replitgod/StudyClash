import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { runIngestionJob } from "@/lib/server/curriculum/jobs/ingestionJob";
import { runChunkingJob } from "@/lib/server/curriculum/jobs/chunkingJob";
import { runIndexingJob } from "@/lib/server/curriculum/jobs/indexingJob";
import { runSummarizationJob } from "@/lib/server/curriculum/jobs/summarizationJob";
import { runConceptMappingJob } from "@/lib/server/curriculum/jobs/conceptMappingJob";
import { runCoveragePlanningJob } from "@/lib/server/curriculum/jobs/coveragePlanningJob";
import { runQuestionGenerationJob } from "@/lib/server/curriculum/jobs/questionGenerationJob";
import { runQuestionVerificationJob } from "@/lib/server/curriculum/jobs/questionVerificationJob";
import { recordJobStep } from "@/lib/server/curriculum/jobSteps";
import type { JobHandler, ProcessingJobRow } from "@/lib/server/curriculum/jobs/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Wall-clock budget per invocation, leaving headroom under maxDuration for
// the final DB writes and the self-chain kick.
const TIME_BUDGET_MS = 45_000;
// A job stuck "running" longer than this is treated as abandoned (the
// invocation that owned it was killed/crashed) and becomes eligible for
// pickup again -- this is what makes "resume interrupted jobs" real rather
// than aspirational.
const STALE_RUNNING_MINUTES = 10;
// Safety net against a runaway self-chain (should never trigger given each
// handler's pending-work queue strictly shrinks every call, but cheap
// insurance against a future handler bug).
const MAX_CHAIN_DEPTH = 200;

// One handler per job_type (see the check constraint on
// processing_jobs.job_type) -- course_publish is the only one left to add,
// once Section 10 needs a "publish this course to students" step.
const HANDLERS: Record<string, JobHandler> = {
  document_ingestion: runIngestionJob,
  chunking: runChunkingJob,
  indexing: runIndexingJob,
  summarization: runSummarizationJob,
  concept_mapping: runConceptMappingJob,
  coverage_planning: runCoveragePlanningJob,
  question_generation: runQuestionGenerationJob,
  question_verification: runQuestionVerificationJob,
};

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function kickSelf(request: NextRequest, chainDepth: number): Promise<void> {
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    console.error("curriculum pipeline self-chain hit MAX_CHAIN_DEPTH -- stopping to avoid a runaway loop.");
    return;
  }
  try {
    const origin = request.nextUrl.origin;
    const headers: Record<string, string> = { "x-chain-depth": String(chainDepth + 1) };
    if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
    void fetch(`${origin}/api/curriculum/process`, { method: "POST", headers }).catch(() => {});
  } catch {
    // Best-effort only.
  }
}

// Vercel Cron sends GET requests -- this is the durable fallback for
// anything the fire-and-forget POST kicks (from document upload, and from
// this route self-chaining) failed to finish, e.g. an invocation that got
// killed mid-flight and left a job stuck "running" past
// STALE_RUNNING_MINUTES. On Vercel Hobby, cron granularity is daily-only
// (see vercel.json) -- the immediate POST-kick chain is what makes
// processing feel fast in practice; this GET path exists so nothing is
// ever permanently stuck if that chain breaks somewhere.
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chainDepth = Number(request.headers.get("x-chain-depth") || "0");
  const supabase = getServiceSupabaseClient();
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000).toISOString();
  const jobTypes = Object.keys(HANDLERS);

  // Pick one job across all known job types: prefer a fresh queued one,
  // but pick up an abandoned "running" job (crashed invocation, no
  // self-chain happened) if nothing fresh is waiting. Highest priority
  // first, oldest within a priority tier -- matches
  // idx_processing_jobs_dequeue's (status, priority desc, scheduled_at)
  // shape exactly (nothing sets a non-zero priority yet, but the ordering
  // itself was silently ignoring the column until this pass).
  const { data: candidateJobs } = await supabase
    .from("processing_jobs")
    .select("*")
    .in("job_type", jobTypes)
    .or(`status.eq.queued,and(status.eq.running,updated_at.lt.${staleThreshold})`)
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const job = candidateJobs?.[0] as ProcessingJobRow | undefined;
  if (!job) {
    return NextResponse.json({ message: "No curriculum jobs pending.", processed: false });
  }

  const handler = HANDLERS[job.job_type];
  if (!handler) {
    // Should be unreachable given the query above only selects known
    // job_types, but fail loudly rather than silently dropping the job.
    await supabase
      .from("processing_jobs")
      .update({ status: "failed", last_error: `No handler for job_type "${job.job_type}".` })
      .eq("id", job.id);
    return NextResponse.json({ error: `No handler for job_type "${job.job_type}".` }, { status: 500 });
  }

  if (job.attempt_count >= job.max_attempts) {
    await supabase
      .from("processing_jobs")
      .update({ status: "failed", last_error: "Max attempts exceeded.", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (job.document_id) {
      await supabase
        .from("documents")
        .update({ processing_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", job.document_id);
    }
    void kickSelf(request, chainDepth);
    return NextResponse.json({ message: "Job exceeded max attempts, marked failed.", jobId: job.id });
  }

  await supabase
    .from("processing_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      attempt_count: job.attempt_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  // Descriptive step label when the job's own payload carries a
  // sub-stage marker (e.g. summarization's phase, question_generation's
  // scope) -- falls back to the bare job_type otherwise.
  const stepLabel = (() => {
    const p = job.payload as Record<string, unknown> | undefined;
    const marker = (p?.phase as string | undefined) ?? (p?.scope as string | undefined);
    return marker ? `${job.job_type}:${marker}` : job.job_type;
  })();
  const stepOrder = job.attempt_count + 1;

  try {
    const result = await handler(job, TIME_BUDGET_MS);

    if (result.done) {
      await supabase
        .from("processing_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          payload: result.payload ?? job.payload,
        })
        .eq("id", job.id);
    } else {
      await supabase
        .from("processing_jobs")
        .update({ payload: result.payload, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    void recordJobStep({
      jobId: job.id,
      stepOrder,
      stepName: stepLabel,
      status: "completed",
      input: job.payload,
      output: result.payload ?? null,
    });

    void kickSelf(request, chainDepth);
    return NextResponse.json({ message: result.message, jobId: job.id, jobType: job.job_type, done: result.done });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error.";
    console.error(`${job.job_type} job ${job.id} failed:`, message);

    void recordJobStep({
      jobId: job.id,
      stepOrder,
      stepName: stepLabel,
      status: "failed",
      input: job.payload,
      errorMessage: message,
    });

    const willRetry = job.attempt_count + 1 < job.max_attempts;
    await supabase
      .from("processing_jobs")
      .update({
        status: willRetry ? "queued" : "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (job.document_id && job.job_type === "document_ingestion") {
      await supabase
        .from("documents")
        .update({ processing_status: willRetry ? "uploaded" : "failed", updated_at: new Date().toISOString() })
        .eq("id", job.document_id);
    }

    void kickSelf(request, chainDepth);
    return NextResponse.json({ error: message, jobId: job.id, willRetry }, { status: 500 });
  }
}
