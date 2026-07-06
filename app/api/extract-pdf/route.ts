import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No PDF file uploaded." },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const result = await extractText(uint8Array);
    const extractedText = Array.isArray(result.text)
      ? result.text.join("\n").trim()
      : String(result.text || "").trim();

    if (!extractedText) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF." },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to extract PDF text.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}