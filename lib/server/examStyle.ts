// How a generated question should look when a student is preparing for a
// specific exam.
//
// Two things vary by exam and both have to be right or the practice teaches
// the wrong test:
//
//   the shape    how many options a question has. LSAT, GMAT and USMLE
//                items have five; the SAT, ACT, AP, MCAT, NCLEX, JEE and
//                NEET have four; the GRE mixes four-option quantitative
//                comparisons with five-option problem solving.
//   the style    what the board actually asks. Written from each board's
//                PUBLISHED specification (current as of the 2025-26 test
//                year: the enhanced ACT, the shortened GRE, GMAT Focus, the
//                LSAT without logic games, the NGN NCLEX). The specifications
//                are public; the question banks are not, and nothing here
//                reproduces or paraphrases a real item.
//
// Server-only: this text is interpolated into model prompts, so the track id
// must come through normalizeExamTrack's allowlist first.

import type { ExamTrackId } from "@/lib/examTracks";
import type { QuestionShape } from "@/lib/server/generatedQuestions";

type ExamStyle = {
  /** Inclusive range of answer options a question may have. */
  choices: [number, number];
  guidance: string;
};

// The exact wording of the fixed option sets some exams use. Quoted into the
// prompt, and used after generation to keep these options in their canonical
// order instead of shuffling them.
export const GRE_QC_OPTIONS = [
  "Quantity A is greater.",
  "Quantity B is greater.",
  "The two quantities are equal.",
  "The relationship cannot be determined from the information given.",
] as const;

export const GMAT_DS_OPTIONS = [
  "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.",
  "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.",
  "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.",
  "EACH statement ALONE is sufficient.",
  "Statements (1) and (2) TOGETHER are NOT sufficient.",
] as const;

const CANONICAL_SETS: ReadonlyArray<readonly string[]> = [GRE_QC_OPTIONS, GMAT_DS_OPTIONS];

const STYLES: Record<ExamTrackId, ExamStyle> = {
  sat: {
    choices: [4, 4],
    guidance: `Write original questions in the style of the Digital SAT (College Board). Never reproduce or paraphrase a real SAT question.
Reading and Writing:
- Every question carries its own short text of 25-150 words (or two short texts on the same topic), written into question_text, followed by one question. Never share a text between questions.
- Use the real question types: words in context ("most logical and precise word or phrase"), text structure and purpose, cross-text connections, central ideas and details, command of evidence (textual, or quantitative with the data written as a short sentence or list inside the text), inferences ("most logically completes the text"), boundaries and form/structure/sense (Standard English conventions), transitions, and rhetorical synthesis (a student's notes as a short list, then "which choice most effectively uses relevant information from the notes to accomplish this goal").
- Topic labels are the four domains: "Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions".
Math:
- Topic labels are the four domains: "Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry".
- Spare, precise stems with realistic context where the SAT uses it. A calculator is allowed on the real test.
- Every question here is multiple choice with four options. Each wrong option is the exact result of a nameable mistake: a sign error, the wrong formula, stopping a step early, misreading a rate or a percent.
- No figure can be shown, so describe any geometry completely in words: which points, which lengths, which angles.`,
  },
  act: {
    choices: [4, 4],
    guidance: `Write original questions in the style of the enhanced ACT (English, Math, Reading, and the optional Science section). Never reproduce a real ACT question.
- English: two to five sentences of a passage in question_text with the tested portion marked in [square brackets]; ask for the best version of the bracketed portion. Offer "NO CHANGE" as one option when the original is a real candidate. Cover Conventions of Standard English, Production of Writing, and Knowledge of Language.
- Math: four options, as on the enhanced ACT. Cover Preparing for Higher Math (number and quantity, algebra, functions, geometry, statistics and probability), Integrating Essential Skills, and Modeling. Describe any figure in words.
- Reading: a passage of 120-220 words in question_text (literary narrative, social science, humanities, or natural science) and one question on key ideas and details, craft and structure, or integration of knowledge and ideas.
- Science: an experiment, study, or data set described in words (state the variables and the results), then one question on interpreting data, scientific investigation, or evaluating models.
- Topic labels: the section and reporting category, e.g. "Math: Functions", "English: Conventions".`,
  },
  ap: {
    choices: [4, 4],
    guidance: `Write original questions in the style of the AP exam for the course this material belongs to (College Board). Never reproduce a released AP question.
- Most AP multiple-choice questions are stimulus-based: a primary or secondary source excerpt, a described data set or graph, an experimental setup, or a scenario, followed by a question. Put the whole stimulus in question_text.
- Test the course's disciplinary skills, not bare recall: causation, comparison, continuity and change, sourcing and situation, claims and evidence for history and social science; experimental design, data analysis, argumentation, and applying models for the sciences.
- Four options.
- Topic labels are the course unit, e.g. "Unit 3: Cellular Energetics".`,
  },
  mcat: {
    choices: [4, 4],
    guidance: `Write original questions in the style of the MCAT (AAMC). Never reproduce an AAMC question.
- Label topics by section: "Chem/Phys", "CARS", "Bio/Biochem", "Psych/Soc", optionally followed by a content category.
- Most science questions are passage-based: a compact research or experimental passage of 80-200 words in question_text (describe any data in words), then one question. Some are discrete questions with no passage.
- Test the scientific inquiry and reasoning skills: knowledge of concepts, scientific reasoning and problem solving, reasoning about research design, and data-based and statistical reasoning.
- CARS questions use humanities or social-science passages and require no outside knowledge.
- Four options.`,
  },
  lsat: {
    choices: [5, 5],
    guidance: `Write original questions in the style of the current LSAT (LSAC): Logical Reasoning and Reading Comprehension. The Analytical Reasoning (logic games) section was removed in 2024, so do not write games. Never reproduce a real PrepTest question.
- Five options for every question.
- Logical Reasoning: a stimulus of three to six sentences in question_text, then a standard stem: flaw, necessary assumption, sufficient assumption, strengthen, weaken, must be true, most strongly supported, principle, parallel reasoning, method of reasoning, resolve the discrepancy, or main conclusion.
- Reading Comprehension: a dense passage of 150-250 words in question_text, then a question on main point, author's attitude, structure, inference, or application.
- Wrong options should tempt the way LSAT options do: out of scope, too strong, reversed logic, or true but irrelevant.
- Topic labels are the question type, e.g. "Flaw", "Necessary assumption", "RC: Author's attitude".`,
  },
  nclex: {
    choices: [4, 4],
    guidance: `Write original questions in the style of the NCLEX-RN Next Generation (NCSBN). Never reproduce a real NCLEX item.
- Each question is a stand-alone clinical judgment item: a short vignette with the client's age, setting, and the relevant findings, vitals, or labs, then a question asking for the priority action, the best response, the finding that needs follow-up, or the expected outcome.
- Say "client", not "patient". Use generic drug names and standard units.
- Test the Clinical Judgment Measurement Model steps: recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes. Prioritize with airway-breathing-circulation, safety, acute over chronic, and unstable over stable.
- Four options. Wrong options are actions a nurse might reasonably take, just not first or best.
- Topic labels are the Client Needs categories: "Management of Care", "Safety and Infection Control", "Health Promotion and Maintenance", "Psychosocial Integrity", "Basic Care and Comfort", "Pharmacological and Parenteral Therapies", "Reduction of Risk Potential", "Physiological Adaptation".`,
  },
  gre: {
    choices: [4, 5],
    guidance: `Write original questions in the style of the shortened GRE General Test (ETS). Never reproduce a real GRE question.
- Verbal: reading comprehension (a short passage in question_text, then one question) and single-blank text completion (the sentence with ______ for the blank). Five options for both. Do not write sentence equivalence, which needs two answers.
- Quantitative comparison: state any shared information, then "Quantity A: ..." and "Quantity B: ...", and use exactly these four options, word for word: "${GRE_QC_OPTIONS.join('", "')}".
- Quantitative problem solving: five options. Arithmetic, algebra, geometry (describe any figure in words), and data analysis (describe any data in words).
- Topic labels, e.g. "Verbal: Text Completion", "Quant: Quantitative Comparison", "Quant: Data Analysis".`,
  },
  gmat: {
    choices: [5, 5],
    guidance: `Write original questions in the style of the GMAT Focus Edition (GMAC). Never reproduce a real GMAT question. Sentence correction and geometry are no longer tested, so do not write them.
- Five options for every question.
- Quantitative Reasoning: problem solving in arithmetic and algebra.
- Verbal Reasoning: critical reasoning (a short argument in question_text, then strengthen, weaken, assumption, evaluate, inference, or explain) and reading comprehension (a passage of 150-250 words in question_text).
- Data Insights, data sufficiency: state the question, then "(1) ..." and "(2) ...", and use exactly these five options, word for word: "${GMAT_DS_OPTIONS.join('", "')}".
- Data Insights, table analysis or graphics interpretation: describe the data in words inside question_text.
- Topic labels, e.g. "Quant: Ratios", "Verbal: Critical Reasoning", "Data Insights: Data Sufficiency".`,
  },
  jee: {
    choices: [4, 4],
    guidance: `Write original questions in the style of JEE Main (NTA): Physics, Chemistry, and Mathematics at Class 11-12 depth and JEE Main difficulty. Never reproduce a real JEE question.
- Four options, exactly one correct.
- Numerical problems are fully specified, with units, and state any constants they rely on (for example g = 10 m/s^2 when that is intended).
- Wrong options are the results of real slips: a sign error, a missing factor of 2, a unit conversion, the wrong formula.
- Topic labels: "Physics: <chapter>", "Chemistry: <chapter>", or "Mathematics: <chapter>".`,
  },
  neet: {
    choices: [4, 4],
    guidance: `Write original questions in the style of NEET UG (NTA): Physics, Chemistry, and Biology (Botany and Zoology), strictly within the NCERT Class 11-12 syllabus. Never reproduce a real NEET question.
- Four options, exactly one correct.
- Use NEET's formats: direct concept questions, statement-based questions ("Statement I: ... Statement II: ..."), assertion-reason, and match-the-column (write both columns as short lists in question_text).
- Biology follows NCERT closely and goes no further.
- Topic labels: "Physics: <chapter>", "Chemistry: <chapter>", "Biology: <chapter>".`,
  },
  usmle: {
    choices: [5, 5],
    guidance: `Write original questions in the style of USMLE Step 1 (NBME). Never reproduce a real NBME question.
- Each question is a clinical vignette (age and sex, presentation, history, exam, and relevant labs with units) followed by a question on the underlying basic science: pathophysiology, mechanism of a drug or its adverse effect, microbiology, biochemistry, anatomy, physiology, or behavioral science and ethics.
- Two steps of reasoning: recognize the condition from the vignette, then answer about the mechanism. Do not name the diagnosis in the stem when recognizing it is the point.
- Five options, one best answer, all from the same category (all drugs, all enzymes, all nerves).
- Use generic drug names.
- Topic labels: "<System>: <Discipline>", e.g. "Cardiovascular: Pharmacology".`,
  },
};

/** The option-count rule for a question type on a given exam (or none). */
export function questionShapeFor(
  track: ExamTrackId | null | undefined,
  questionType: "multiple_choice" | "true_false"
): QuestionShape {
  if (questionType === "true_false") {
    return { questionType, minChoices: 2, maxChoices: 2 };
  }
  const [minChoices, maxChoices] = track ? STYLES[track].choices : [4, 4];
  return { questionType, minChoices, maxChoices };
}

/** A human description of the option count, for the prompt. */
export function describeChoiceCount(shape: QuestionShape): string {
  return shape.minChoices === shape.maxChoices
    ? `exactly ${shape.minChoices}`
    : `${shape.minChoices} or ${shape.maxChoices} (as the exam format for that question type requires)`;
}

export function examGuidance(track: ExamTrackId | null | undefined): string {
  return track ? STYLES[track].guidance : "";
}

/**
 * Display order for a question's options.
 *
 * Options are shuffled because models put the key in the same position far
 * more often than chance. The exception is a fixed option set a real exam
 * always prints in one order -- the GRE's quantitative comparison, the
 * GMAT's data sufficiency -- where shuffling makes a familiar format
 * unrecognizable. Those come back in canonical order.
 */
export function orderChoices(choices: string[], random: () => number = Math.random): string[] {
  for (const canonical of CANONICAL_SETS) {
    const lowered = new Set(canonical.map((c) => c.toLowerCase()));
    if (
      choices.length === canonical.length &&
      choices.every((c) => lowered.has(c.trim().toLowerCase()))
    ) {
      return canonical.map(
        (c) => choices.find((choice) => choice.trim().toLowerCase() === c.toLowerCase()) as string
      );
    }
  }
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
