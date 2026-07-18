import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

// Private bucket, created via the service-role Storage API (not a SQL
// migration -- bucket creation isn't DDL). No client-facing RLS policies on
// storage.objects: every read/write of this bucket goes through a
// service-role API route, same "server-side only" trust boundary as every
// other sensitive table in this schema. Never make this bucket public.
export const CURRICULUM_BUCKET = "curriculum-documents";

export function buildStoragePath(courseId: string, documentId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${courseId}/${documentId}/${safeName}`;
}

export async function uploadDocumentFile(args: {
  storagePath: string;
  file: Buffer;
  contentType: string;
}): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.storage
    .from(CURRICULUM_BUCKET)
    .upload(args.storagePath, args.file, {
      contentType: args.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to store document: ${error.message}`);
  }
}

export async function downloadDocumentFile(storagePath: string): Promise<Buffer> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.storage.from(CURRICULUM_BUCKET).download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to read stored document: ${error?.message || "not found"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
