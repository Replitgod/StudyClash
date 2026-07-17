import type { ShortTermPlanAssessmentType } from "@/lib/server/studyPlanCreation";

// Pulls VYRA's machine-readable "PLAN_DUE_DATE:"/"PLAN_ASSESSMENT_NAME:"
// marker lines (see the vyra-chat system prompt's rule 11) out of a reply so
// they're never shown to the student, and returns the parsed values so the
// caller can actually create the study plan those lines describe. Strips
// both lines unconditionally, even if the date fails validation, so a
// malformed marker never leaks into the visible chat.
export function extractPlanMarkers(text: string): {
  cleanedText: string;
  dueDate: string | null;
  assessmentName: string | null;
} {
  const dueDateMatch = text.match(/^PLAN_DUE_DATE:\s*(\d{4}-\d{2}-\d{2})\s*$/im);
  const nameMatch = text.match(/^PLAN_ASSESSMENT_NAME:\s*(.+?)\s*$/im);

  const cleanedText = text
    .replace(/^PLAN_DUE_DATE:.*$/im, "")
    .replace(/^PLAN_ASSESSMENT_NAME:.*$/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const dueDate = dueDateMatch ? dueDateMatch[1] : null;
  const parsedDate = dueDate ? new Date(`${dueDate}T00:00:00`) : null;

  return {
    cleanedText,
    dueDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? dueDate : null,
    assessmentName: nameMatch ? nameMatch[1].slice(0, 80).trim() : null,
  };
}

export function inferAssessmentType(message: string): ShortTermPlanAssessmentType {
  const lower = message.toLowerCase();
  if (/\bfinal\b/.test(lower)) return "final_exam";
  if (/\bmidterm\b/.test(lower)) return "midterm";
  if (/\bquiz\b/.test(lower)) return "quiz";
  if (/\bpresentation\b/.test(lower)) return "presentation";
  if (/\b(assignment|homework|essay|project)\b/.test(lower)) return "assignment";
  if (/\b(sat|act|ap\s|mcat|lsat|nclex|standardized)\b/.test(lower)) return "standardized_test";
  return "unit_test";
}
