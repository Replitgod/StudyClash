// Shared contract every job handler (ingestion, chunking, indexing, and
// later summarization/concept_mapping/coverage_planning/question_generation/
// question_verification/course_publish) implements -- lets the dispatcher
// in app/api/curriculum/process/route.ts stay generic instead of growing a
// new branch of retry/chain/finalize logic per job type.

export type ProcessingJobRow = {
  id: string;
  course_id: string;
  document_id: string | null;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  payload: Record<string, unknown>;
};

export type JobHandlerResult =
  | { done: true; payload?: Record<string, unknown>; message: string }
  | { done: false; payload: Record<string, unknown>; message: string };

export type JobHandler = (job: ProcessingJobRow, timeBudgetMs: number) => Promise<JobHandlerResult>;
