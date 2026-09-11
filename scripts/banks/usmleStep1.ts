// An original USMLE Step 1 question bank.
//
// Every vignette was written for this file. Nothing reproduces, paraphrases
// or is derived from an NBME item -- Step 1 questions are secure and
// copyrighted, and reproducing one would expose both AceDecks and any school
// buying Classroom. What is taken from the USMLE program is the published
// content outline: the organ-system and process dimensions, and the fact that
// Step 1 asks almost everything through a clinical vignette.
//
// That last point is the design constraint. Step 1 does not ask "what does
// this enzyme do"; it gives a patient and asks what is happening to them. A
// bank of isolated recall items would be preparing students for an exam that
// no longer exists -- the old two-step recall format was retired long before
// the 2022 move to pass/fail.
//
// Every item here turns on a mechanism a second-year medical student is
// expected to know cold, and every distractor is a real competing diagnosis
// or a real alternative mechanism rather than a throwaway. An implausible
// option in a clinical vignette is worse than useless: it teaches
// test-taking rather than differential diagnosis.
//
// `domain` carries the organ system and `skill` the competency, matching the
// two dimensions the content outline itself uses.

import type { BankItem } from "./jeeMain";

const mc = (...texts: string[]) => texts.map((text, i) => ({ id: "ABCD"[i], text }));

export const USMLE_STEP_1: BankItem[] = [
  {
    section: "step1",
    domain: "Cardiovascular System",
    skill: "Pathophysiology",
    difficulty: "medium",
    stimulus:
      "A 58-year-old man presents with crushing substernal chest pain radiating to his left arm, beginning 90 minutes ago. He is diaphoretic. ECG shows ST-segment elevation in leads II, III and aVF.",
    questionText: "Occlusion of which artery best explains these findings?",
    choices: mc(
      "Right coronary artery",
      "Left anterior descending artery",
      "Left circumflex artery",
      "Left main coronary artery"
    ),
    correct: "A",
    explanation:
      "Leads II, III and aVF look at the inferior surface of the heart, which is supplied by the right coronary artery in the roughly 85 percent of people with right-dominant circulation. The left anterior descending supplies the anterior wall and would produce changes in the precordial leads V1 to V4, while the circumflex supplies the lateral wall seen in I, aVL, V5 and V6. Recognising which leads map to which territory is the single highest-yield ECG skill on this exam.",
  },
  {
    section: "step1",
    domain: "Cardiovascular System",
    skill: "Pharmacology",
    difficulty: "medium",
    stimulus:
      "A 64-year-old woman with heart failure and reduced ejection fraction is started on a medication. Two weeks later her serum potassium has risen and she reports a dry cough.",
    questionText: "Which drug class most likely accounts for both findings?",
    choices: mc(
      "ACE inhibitor",
      "Thiazide diuretic",
      "Beta blocker",
      "Loop diuretic"
    ),
    correct: "A",
    explanation:
      "ACE inhibitors reduce aldosterone, which causes potassium retention, and they also block the breakdown of bradykinin, whose accumulation produces the characteristic dry cough. Both diuretic classes listed cause potassium loss rather than retention, which is the opposite of what is described. Switching to an angiotensin receptor blocker relieves the cough because it does not affect bradykinin.",
  },
  {
    section: "step1",
    domain: "Respiratory and Renal/Urinary Systems",
    skill: "Pathophysiology",
    difficulty: "medium",
    stimulus:
      "A 6-year-old boy develops facial swelling and frothy urine. Urinalysis shows 4+ proteinuria with no red blood cells. Serum albumin is low and cholesterol is elevated. Light microscopy of a renal biopsy is unremarkable.",
    questionText: "What is the most likely diagnosis?",
    choices: mc(
      "Minimal change disease",
      "Post-streptococcal glomerulonephritis",
      "IgA nephropathy",
      "Membranous nephropathy"
    ),
    correct: "A",
    explanation:
      "This is nephrotic syndrome -- heavy proteinuria, low albumin, oedema and hyperlipidaemia -- in a young child with a normal biopsy under light microscopy, which is the classic description of minimal change disease. The two glomerulonephritides listed are nephritic and would show haematuria rather than bland urine. Membranous nephropathy is nephrotic but is a disease of adults and shows thickened capillary walls.",
  },
  {
    section: "step1",
    domain: "Respiratory and Renal/Urinary Systems",
    skill: "Physiology",
    difficulty: "hard",
    stimulus:
      "A 24-year-old woman presents with anxiety and tingling in her fingers after an argument. She is breathing rapidly. Arterial blood gas shows pH 7.52, PaCO2 28 mmHg, and bicarbonate 23 mEq/L.",
    questionText: "Which acid-base disturbance is present?",
    choices: mc(
      "Acute respiratory alkalosis",
      "Acute respiratory acidosis",
      "Metabolic alkalosis with respiratory compensation",
      "Metabolic acidosis with respiratory compensation"
    ),
    correct: "A",
    explanation:
      "The pH is high, so this is an alkalosis, and the PaCO2 is low, which means the lungs are the cause rather than the compensation -- hyperventilation is blowing off carbon dioxide. A near-normal bicarbonate confirms it is acute, since renal compensation takes a day or more to appear. The tingling comes from a fall in ionised calcium as alkalosis increases its binding to albumin.",
  },
  {
    section: "step1",
    domain: "Reproductive and Endocrine Systems",
    skill: "Pathophysiology",
    difficulty: "medium",
    stimulus:
      "A 28-year-old woman reports weight loss despite a good appetite, heat intolerance, palpitations and anxiety. On examination she has a diffusely enlarged thyroid, a fine tremor and proptosis.",
    questionText: "Which mechanism underlies her condition?",
    choices: mc(
      "Autoantibodies that stimulate the TSH receptor",
      "Autoantibodies that destroy thyroid peroxidase",
      "A pituitary adenoma secreting excess TSH",
      "Excess iodine intake causing colloid accumulation"
    ),
    correct: "A",
    explanation:
      "Graves disease is caused by thyroid-stimulating immunoglobulins that bind and activate the TSH receptor, driving hormone production regardless of feedback. The eye findings are specific to Graves and come from the same antibodies acting on retro-orbital tissue. Anti-thyroid peroxidase antibodies belong to Hashimoto thyroiditis, which causes hypothyroidism, and a TSH-secreting adenoma is rare and would not produce proptosis.",
  },
  {
    section: "step1",
    domain: "Reproductive and Endocrine Systems",
    skill: "Biochemistry",
    difficulty: "hard",
    stimulus:
      "A 19-year-old with type 1 diabetes is brought in confused after missing insulin doses. He is breathing deeply and rapidly, and his breath smells fruity. Glucose is 480 mg/dL and serum ketones are markedly elevated.",
    questionText:
      "The deep rapid breathing is best explained as a response to which underlying disturbance?",
    choices: mc(
      "Metabolic acidosis from accumulated ketoacids",
      "Hypoglycaemia in the respiratory centre",
      "Hyperosmolarity causing direct medullary stimulation",
      "Hypokalaemia impairing respiratory muscle function"
    ),
    correct: "A",
    explanation:
      "Without insulin, unrestrained lipolysis floods the circulation with free fatty acids that the liver converts into ketoacids, producing an anion gap metabolic acidosis. Kussmaul respiration is the compensatory attempt to blow off carbon dioxide and raise pH. Total body potassium is depleted in this condition even when the measured serum level looks normal or high, because acidosis shifts potassium out of cells -- which is why replacement begins early during treatment.",
  },
  {
    section: "step1",
    domain: "Nervous System and Special Senses",
    skill: "Anatomy",
    difficulty: "hard",
    stimulus:
      "A 70-year-old man is found to have weakness of the right face and right arm, with the leg largely spared. He speaks in short effortful phrases but follows commands without difficulty.",
    questionText: "Which vascular territory is most likely involved?",
    choices: mc(
      "Left middle cerebral artery",
      "Left anterior cerebral artery",
      "Right middle cerebral artery",
      "Basilar artery"
    ),
    correct: "A",
    explanation:
      "The motor homunculus places face and arm on the lateral convexity supplied by the middle cerebral artery, while the leg sits medially in anterior cerebral territory -- so face and arm with a spared leg points to the MCA. Effortful speech with preserved comprehension is Broca aphasia, localising to the dominant hemisphere, which is the left in nearly all right-handed people. Right-sided weakness confirms a left-sided lesion, since the corticospinal tract decussates.",
  },
  {
    section: "step1",
    domain: "Nervous System and Special Senses",
    skill: "Pharmacology",
    difficulty: "medium",
    stimulus:
      "A 32-year-old woman with a history of seizures becomes pregnant. Her neurologist reviews her medication because of a known risk of neural tube defects.",
    questionText:
      "Supplementation with which vitamin most directly reduces this risk?",
    choices: mc("Folate", "Vitamin B12", "Vitamin D", "Vitamin K"),
    correct: "A",
    explanation:
      "Folate is required for the one-carbon transfers that build purines and thymidine, and deficiency during the first month impairs closure of the neural tube. Several anticonvulsants, valproate in particular, interfere with folate metabolism. Vitamin B12 deficiency produces a similar megaloblastic anaemia but not neural tube defects, and vitamin K matters for neonatal bleeding rather than neural development.",
  },
  {
    section: "step1",
    domain: "Blood and Lymphoreticular System",
    skill: "Pathophysiology",
    difficulty: "medium",
    stimulus:
      "A 22-year-old woman of Mediterranean descent has a microcytic anaemia. Serum iron, ferritin and total iron-binding capacity are all normal. Haemoglobin electrophoresis shows an elevated HbA2 fraction.",
    questionText: "What is the most likely diagnosis?",
    choices: mc(
      "Beta thalassaemia minor",
      "Iron deficiency anaemia",
      "Anaemia of chronic disease",
      "Sideroblastic anaemia"
    ),
    correct: "A",
    explanation:
      "Normal iron studies exclude iron deficiency, which is the usual cause of a microcytic anaemia, and the raised HbA2 is the diagnostic finding: reduced beta chain production leaves more delta chains to pair with alpha. The distinction matters practically -- treating this as iron deficiency leads to iron loading with no benefit, since the patient is not iron deficient at all.",
  },
  {
    section: "step1",
    domain: "Multisystem Processes and Disorders",
    skill: "Microbiology",
    difficulty: "medium",
    stimulus:
      "A 19-year-old college student presents with fever, severe headache and neck stiffness. Cerebrospinal fluid shows a high neutrophil count, low glucose and elevated protein. Gram stain shows gram-negative diplococci.",
    questionText: "Which organism is most likely responsible?",
    choices: mc(
      "Neisseria meningitidis",
      "Streptococcus pneumoniae",
      "Haemophilus influenzae type b",
      "Listeria monocytogenes"
    ),
    correct: "A",
    explanation:
      "Gram-negative diplococci in the cerebrospinal fluid of a young adult living in close quarters is Neisseria meningitidis. The CSF picture -- neutrophils, low glucose, high protein -- confirms a bacterial rather than viral cause, since viral meningitis shows lymphocytes and normal glucose. Pneumococcus is a gram-positive diplococcus, and Listeria is a gram-positive rod affecting neonates, the elderly and the immunosuppressed.",
  },
  {
    section: "step1",
    domain: "Multisystem Processes and Disorders",
    skill: "Immunology",
    difficulty: "hard",
    stimulus:
      "Minutes after a bee sting, a 30-year-old man develops widespread urticaria, wheezing and hypotension.",
    questionText: "Which hypersensitivity mechanism is responsible?",
    choices: mc(
      "Type I, mediated by IgE bound to mast cells",
      "Type II, mediated by IgG against cell surface antigens",
      "Type III, mediated by immune complex deposition",
      "Type IV, mediated by sensitised T lymphocytes"
    ),
    correct: "A",
    explanation:
      "Onset within minutes is the signature of a type I reaction: pre-formed IgE on mast cells cross-links and triggers immediate degranulation, releasing histamine, which produces the urticaria, bronchoconstriction and vasodilation. The timing alone distinguishes it -- type IV reactions such as contact dermatitis and the tuberculin test take one to three days because T cells must be recruited and activated.",
  },
  {
    section: "step1",
    domain: "Biostatistics, Epidemiology and Population Health",
    skill: "Biostatistics",
    difficulty: "hard",
    stimulus:
      "A screening test for a disease has a sensitivity of 95 percent and a specificity of 90 percent. It is applied to a population in which the prevalence of the disease is 1 percent.",
    questionText:
      "Which statement about the positive predictive value in this population is correct?",
    choices: mc(
      "It will be low, because most positive results will be false positives",
      "It will be high, because sensitivity is high",
      "It equals the sensitivity, at 95 percent",
      "It is independent of prevalence"
    ),
    correct: "A",
    explanation:
      "In 10,000 people, 100 have the disease and 95 test positive, while 9,900 do not and 10 percent of them -- 990 people -- also test positive. Only 95 of the 1,085 positives are true, so the positive predictive value is about 9 percent. Sensitivity and specificity are properties of the test and do not change with prevalence, but predictive values depend on it entirely, which is the central reason screening a low-prevalence population generates so many false alarms.",
  },
  {
    section: "step1",
    domain: "Gastrointestinal System",
    skill: "Pathophysiology",
    difficulty: "medium",
    stimulus:
      "A 45-year-old man has recurrent burning epigastric pain that improves after eating. Endoscopy shows a duodenal ulcer and urease testing of a biopsy specimen is positive.",
    questionText: "Which mechanism best explains the causative organism's survival in the stomach?",
    choices: mc(
      "It produces urease, generating ammonia that neutralises surrounding acid",
      "It forms endospores resistant to gastric acid",
      "It invades gastric parietal cells and shelters intracellularly",
      "It suppresses gastric acid production entirely"
    ),
    correct: "A",
    explanation:
      "Helicobacter pylori splits urea into ammonia and carbon dioxide, creating an alkaline microenvironment that lets it live in a space almost nothing else tolerates. That same enzyme is what the diagnostic urease test detects. The organism is not an intracellular pathogen and forms no spores -- it lives in the mucus layer above the epithelium.",
  },
  {
    section: "step1",
    domain: "Musculoskeletal, Skin and Subcutaneous Tissue",
    skill: "Pharmacology",
    difficulty: "medium",
    stimulus:
      "A 62-year-old man with a history of gout begins a new medication for long-term prevention. He is advised it will not help an acute attack and may even precipitate one when first started.",
    questionText: "Which drug and mechanism fits this description?",
    choices: mc(
      "Allopurinol, which inhibits xanthine oxidase",
      "Colchicine, which inhibits microtubule polymerisation",
      "Indomethacin, which inhibits cyclooxygenase",
      "Probenecid, which inhibits tubular reabsorption of urate"
    ),
    correct: "A",
    explanation:
      "Allopurinol blocks xanthine oxidase and lowers urate production, which is prevention rather than treatment, and the sudden fall in serum urate can mobilise existing deposits and trigger a flare -- which is why it is started under cover of an anti-inflammatory. Colchicine and indomethacin both treat the acute attack. Probenecid is also preventive but works by increasing excretion, not by reducing synthesis.",
  },
  {
    section: "step1",
    domain: "Social Sciences, Ethics and Communication",
    skill: "Ethics",
    difficulty: "medium",
    stimulus:
      "A 34-year-old woman with decision-making capacity refuses a blood transfusion on religious grounds, despite being told it is likely life-saving. She is calm, understands the consequences, and is consistent in her refusal.",
    questionText: "What is the most appropriate next step?",
    choices: mc(
      "Respect her refusal and pursue alternative management",
      "Obtain a court order to authorise the transfusion",
      "Transfuse once she becomes unconscious",
      "Ask her family to consent on her behalf"
    ),
    correct: "A",
    explanation:
      "An adult with capacity may refuse any treatment, including one that is life-saving, and that right does not weaken because the decision seems unwise to the clinician. Waiting for unconsciousness to override a known wish is a particularly clear violation, since her previously expressed choice still stands. Family members cannot consent over a competent patient, and courts do not override a capacitated adult's refusal.",
  },

  // Step 1 is a hard exam, but it is not uniformly hard, and a bank with no
  // straightforward items cannot support adaptive selection -- there is
  // nothing to step DOWN to when a student is struggling. These three turn
  // on a single mechanism each, with no competing diagnosis to weigh.
  {
    section: "step1",
    domain: "Musculoskeletal, Skin and Subcutaneous Tissue",
    skill: "Biochemistry",
    difficulty: "easy",
    stimulus:
      "A 4-year-old child from a region with limited access to fresh produce has bleeding gums, poor wound healing and bruising. A deficiency of a vitamin required for collagen synthesis is suspected.",
    questionText: "Which vitamin is deficient?",
    choices: mc("Vitamin C", "Vitamin A", "Vitamin K", "Thiamine"),
    correct: "A",
    explanation:
      "Vitamin C is the cofactor for prolyl and lysyl hydroxylase, the enzymes that cross-link collagen. Without it collagen is weak, so vessels leak and wounds fail to close, which is scurvy. Vitamin K also causes bleeding but through clotting factor synthesis rather than collagen, and it would not impair wound healing in this way.",
  },
  {
    section: "step1",
    domain: "Blood and Lymphoreticular System",
    skill: "Pharmacology",
    difficulty: "easy",
    stimulus:
      "A patient on long-term warfarin requires urgent reversal before emergency surgery.",
    questionText: "Which agent directly reverses warfarin's mechanism of action?",
    choices: mc("Vitamin K", "Protamine sulfate", "Naloxone", "Flumazenil"),
    correct: "A",
    explanation:
      "Warfarin blocks vitamin K epoxide reductase, so the liver cannot recycle vitamin K to make factors II, VII, IX and X. Supplying vitamin K restores that synthesis, though it takes hours -- which is why factor concentrate is added when bleeding is immediate. Protamine reverses heparin, naloxone opioids, and flumazenil benzodiazepines.",
  },
  {
    section: "step1",
    domain: "Nervous System and Special Senses",
    skill: "Physiology",
    difficulty: "easy",
    stimulus:
      "A 30-year-old woman has double vision and drooping eyelids that worsen through the day and improve after rest. Antibodies against the postsynaptic acetylcholine receptor are detected.",
    questionText: "Which process is directly impaired?",
    choices: mc(
      "Neuromuscular transmission at the motor end plate",
      "Conduction along the peripheral axon",
      "Release of acetylcholine from the presynaptic terminal",
      "Calcium release from the sarcoplasmic reticulum"
    ),
    correct: "A",
    explanation:
      "In myasthenia gravis, antibodies block and destroy postsynaptic acetylcholine receptors, so the end plate potential fades with repeated stimulation and weakness worsens with use. The transmitter is still released normally, which is what separates it from Lambert-Eaton syndrome, where antibodies attack presynaptic calcium channels and strength briefly improves with activity.",
  },
];
