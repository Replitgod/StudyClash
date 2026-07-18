import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { buildStoragePath, uploadDocumentFile } from "@/lib/server/curriculum/storage";
import { isUnsupportedForExtraction } from "@/lib/server/curriculum/extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const MIME_TO_SOURCE_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "application/vnd.ms-powerpoint": "powerpoint",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "text/plain": "text_file",
};

function inferSourceType(file: File): string | null {
  if (MIME_TO_SOURCE_TYPE[file.type]) return MIME_TO_SOURCE_TYPE[file.type];
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) return "word";
  if (lowerName.endsWith(".pptx") || lowerName.endsWith(".ppt")) return "powerpoint";
  if (/\.(jpe?g|png|webp|heic|heif)$/.test(lowerName)) return "image";
  if (lowerName.endsWith(".txt")) return "text_file";
  return null;
}

async function kickWorker(request: NextRequest): Promise<void> {
  // Fire-and-forget -- immediate processing when possible, with the cron
  // job (app/api/cron/process-curriculum-jobs) as the durable fallback if
  // this call fails, times out, or the invocation gets killed mid-flight.
  // Never awaited by the caller; a slow/failed kick must not block or fail
  // the upload response.
  try {
    const origin = request.nextUrl.origin;
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) {
      headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
    }
    void fetch(`${origin}/api/curriculum/process`, { method: "POST", headers }).catch(() => {});
  } catch {
    // Best-effort only.
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to upload documents." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const courseId = formData.get("courseId");
  const title = formData.get("title");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (typeof courseId !== "string" || !courseId) {
    return NextResponse.json({ error: "courseId is required." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25MB limit." }, { status: 413 });
  }

  const sourceType = inferSourceType(file);
  if (!sourceType) {
    return NextResponse.json(
      { error: "Unsupported file type. Supported: PDF, images, and plain text (Word/PowerPoint support is coming soon)." },
      { status: 400 }
    );
  }
  if (isUnsupportedForExtraction(sourceType)) {
    return NextResponse.json(
      { error: "Word and PowerPoint extraction isn't implemented yet -- export to PDF for now." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();

  // Ownership check -- courses RLS would enforce this for a direct client
  // query, but this route runs with the service role, so it must be
  // checked explicitly here.
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", auth.userId)
    .maybeSingle();

  if (courseError) {
    return NextResponse.json({ error: courseError.message }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  const checksum = createHash("sha256").update(fileBuffer).digest("hex");

  // Duplicate-file detection within this course (Section 1, point 8).
  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id, title, processing_status")
    .eq("course_id", courseId)
    .eq("checksum", checksum)
    .maybeSingle();

  if (existingDocument) {
    return NextResponse.json(
      {
        error: `This exact file was already uploaded as "${existingDocument.title}" (status: ${existingDocument.processing_status}).`,
        existingDocument,
      },
      { status: 409 }
    );
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      course_id: courseId,
      uploaded_by: auth.userId,
      title: typeof title === "string" && title.trim() ? title.trim() : file.name,
      source_type: sourceType,
      storage_path: "", // filled in immediately below
      file_size_bytes: file.size,
      mime_type: file.type || null,
      checksum,
      processing_status: "uploaded",
    })
    .select()
    .single();

  if (insertError || !document) {
    return NextResponse.json({ error: insertError?.message || "Could not create document record." }, { status: 500 });
  }

  const storagePath = buildStoragePath(courseId, document.id, file.name);

  try {
    await uploadDocumentFile({
      storagePath,
      file: fileBuffer,
      contentType: file.type || "application/octet-stream",
    });
  } catch (err) {
    // Roll back the document row rather than leaving an "uploaded" row
    // with no actual file behind it -- a stuck row like that would never
    // be reprocessable.
    await supabase.from("documents").delete().eq("id", document.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not store the uploaded file." },
      { status: 500 }
    );
  }

  await supabase.from("documents").update({ storage_path: storagePath }).eq("id", document.id);

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      course_id: courseId,
      document_id: document.id,
      job_type: "document_ingestion",
      status: "queued",
      payload: { storagePath, sourceType, mimeType: file.type || null },
    })
    .select()
    .single();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  void kickWorker(request);

  return NextResponse.json({ document: { ...document, storage_path: storagePath }, job }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "courseId query param is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", auth.userId)
    .maybeSingle();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id, title, source_type, processing_status, page_count, extraction_confidence, created_at, updated_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data });
}
