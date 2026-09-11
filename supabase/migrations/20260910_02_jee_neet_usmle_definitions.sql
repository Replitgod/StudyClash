-- JEE Main, NEET UG and USMLE Step 1 become real exams.
--
-- Every structure below is from the board's own published pattern, checked
-- on 10 September 2026. Two of the three would have been WRONG from memory
-- alone, which is the reason they were checked rather than recalled:
--
--   NEET UG 2026  The Section A / Section B split introduced in 2021 (where
--                 candidates chose 10 of 15 optional questions) was
--                 discontinued for 2026 on the NMC's recommendation. All 180
--                 questions are now compulsory. Building the 2021 pattern
--                 would have given students an optional section that no
--                 longer exists.
--   USMLE Step 1  The format changed on 14 May 2026, from seven 60-minute
--                 blocks to FOURTEEN 30-minute blocks, still inside one
--                 8-hour session, with no more than 20 items per block and
--                 roughly 280 items in total. Anyone working from the older
--                 format would have built a seven-block exam that no
--                 candidate will ever sit.
--
-- Negative marking is the substantive addition here, handled in
-- lib/examBlueprint.ts rather than faked. JEE and NEET both award +4 for a
-- correct answer and -1 for a wrong one, and their reported result is that
-- arithmetic -- "287 out of 300" -- not a scaled band. Scoring them through
-- the existing theta-to-scale estimator would print a number the student's
-- real result can never agree with.
--
-- It also matters pedagogically. A practice engine that scores a blank and a
-- wrong answer identically teaches an Indian student to guess freely, which
-- is a habit that costs real marks. With the scheme modelled, the app can
-- tell them the truth instead: at +4/-1 on four options a blind guess is
-- worth +0.25 marks, so guessing is very slightly positive and eliminating
-- one option makes it clearly worth doing -- the opposite of the folklore.
--
-- All three are inserted as `coming_soon`. Nothing is published as available
-- until a question bank exists behind it; the status flips live in the seed
-- migrations, next to the questions, so an exam can never be switched on
-- with nothing to serve.
--
-- Safe to run more than once.

-- ============================================================
-- JEE Main (Paper 1, B.E./B.Tech)
-- ============================================================

-- 75 questions: 25 each in Physics, Chemistry and Mathematics, every subject
-- carrying 20 multiple choice and 5 numerical-value items. 300 marks, three
-- hours.
--
-- The real paper does not enforce per-subject timing -- a candidate spends
-- their three hours where they choose. The 60 minutes per section here is
-- AceDecks's practice structure, not a claim about the exam, and it exists
-- because sitting a subject at a time is how anyone actually revises.
insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values (
  'jee-main',
  'JEE Main',
  'National Testing Agency (NTA)',
  'coming_soon',
  'AceDecks JEE Main-style practice. Original questions written to the NTA''s published exam pattern and the NCERT-based syllabus. Not affiliated with or endorsed by the NTA, and not official JEE Main content or past papers.',
  '{
    "sections": [
      {
        "key": "physics",
        "label": "Physics",
        "totalQuestions": 25,
        "totalMinutes": 60,
        "modules": [{"module": 1, "questions": 25, "minutes": 60}],
        "quick": {"questions": 10, "minutes": 24}
      },
      {
        "key": "chemistry",
        "label": "Chemistry",
        "totalQuestions": 25,
        "totalMinutes": 60,
        "modules": [{"module": 1, "questions": 25, "minutes": 60}],
        "quick": {"questions": 10, "minutes": 24}
      },
      {
        "key": "mathematics",
        "label": "Mathematics",
        "totalQuestions": 25,
        "totalMinutes": 60,
        "modules": [{"module": 1, "questions": 25, "minutes": 60}],
        "quick": {"questions": 10, "minutes": 24}
      }
    ],
    "breakMinutesBetweenSections": 0,
    "composite": {"kind": "none"},
    "marking": {"correct": 4, "incorrect": -1, "unattempted": 0, "maxMarks": 300},
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "JEE Main is not adaptive. Each subject is a single fixed section."
    },
    "scoreRange": null,
    "note": "Per-subject timing is AceDecks practice structure. The real paper is a single three-hour sitting the candidate allocates themselves."
  }'::jsonb
)
on conflict (slug) do update
set name = excluded.name,
    provider = excluded.provider,
    disclaimer = excluded.disclaimer,
    configuration = excluded.configuration;

-- ============================================================
-- NEET UG
-- ============================================================

-- 180 questions, all compulsory as of 2026: Physics 45, Chemistry 45, and
-- Biology 90 split across Botany and Zoology. 720 marks, three hours.
--
-- Biology is kept as ONE section of 90 rather than split into Botany and
-- Zoology, because the paper reports Biology as a single 360-mark component
-- and splitting it would invent a score breakdown the candidate never
-- receives.
insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values (
  'neet-ug',
  'NEET UG',
  'National Testing Agency (NTA)',
  'coming_soon',
  'AceDecks NEET-style practice. Original questions written to the NTA''s published exam pattern and the NCERT-based syllabus. Not affiliated with or endorsed by the NTA or the NMC, and not official NEET content or past papers.',
  '{
    "sections": [
      {
        "key": "physics",
        "label": "Physics",
        "totalQuestions": 45,
        "totalMinutes": 45,
        "modules": [{"module": 1, "questions": 45, "minutes": 45}],
        "quick": {"questions": 12, "minutes": 12}
      },
      {
        "key": "chemistry",
        "label": "Chemistry",
        "totalQuestions": 45,
        "totalMinutes": 45,
        "modules": [{"module": 1, "questions": 45, "minutes": 45}],
        "quick": {"questions": 12, "minutes": 12}
      },
      {
        "key": "biology",
        "label": "Biology (Botany and Zoology)",
        "totalQuestions": 90,
        "totalMinutes": 90,
        "modules": [{"module": 1, "questions": 90, "minutes": 90}],
        "quick": {"questions": 20, "minutes": 20}
      }
    ],
    "breakMinutesBetweenSections": 0,
    "composite": {"kind": "none"},
    "marking": {"correct": 4, "incorrect": -1, "unattempted": 0, "maxMarks": 720},
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "NEET is not adaptive. Each subject is a single fixed section."
    },
    "scoreRange": null,
    "note": "The Section A/B optional-question format used from 2021 was discontinued for 2026; all 180 questions are compulsory."
  }'::jsonb
)
on conflict (slug) do update
set name = excluded.name,
    provider = excluded.provider,
    disclaimer = excluded.disclaimer,
    configuration = excluded.configuration;

-- ============================================================
-- USMLE Step 1
-- ============================================================

-- The post-14-May-2026 format: fourteen 30-minute blocks in one 8-hour
-- session, no more than 20 items per block, about 280 items in total.
--
-- Modelled as one section of 280 rather than fourteen, because the blocks
-- are a delivery and break structure rather than fourteen differently-scored
-- papers -- the same reason the NCLEX is one section here.
--
-- Quick mode is deliberately 20 items in 30 minutes: that is EXACTLY one
-- real block, so a student practising in short sessions is rehearsing the
-- actual unit of the exam rather than an arbitrary AceDecks sample.
--
-- No score scale and no composite. Step 1 has been reported Pass/Fail since
-- 2022, so a three-digit score would be a number the candidate will never be
-- given. AceDecks reports readiness and accuracy and does not simulate a
-- pass/fail determination, which is a judgement only the NBME makes.
insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values (
  'usmle-step-1',
  'USMLE Step 1',
  'NBME and FSMB',
  'coming_soon',
  'AceDecks USMLE Step 1-style practice. Original questions written to the publicly published USMLE content outline. Not affiliated with, endorsed by, or containing questions from the NBME, the FSMB or the USMLE program, and not a substitute for clinical judgment or professional advice.',
  '{
    "sections": [
      {
        "key": "step1",
        "label": "Step 1 Practice",
        "totalQuestions": 280,
        "totalMinutes": 420,
        "modules": [{"module": 1, "questions": 280, "minutes": 420}],
        "quick": {"questions": 20, "minutes": 30}
      }
    ],
    "breakMinutesBetweenSections": 0,
    "composite": {"kind": "none"},
    "marking": null,
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "Step 1 is not adaptive. Items are delivered in fixed blocks."
    },
    "scoreRange": null,
    "note": "Format effective 14 May 2026: fourteen 30-minute blocks in one 8-hour session, no more than 20 items per block. Quick mode is one block. Reported Pass/Fail since 2022, so no numeric score is estimated.",
    "contentAreas": [
      {"key": "reproductive_endocrine", "label": "Reproductive and Endocrine Systems", "share": [12, 16]},
      {"key": "nervous", "label": "Nervous System and Special Senses", "share": [11, 15]},
      {"key": "cardiovascular", "label": "Cardiovascular System", "share": [10, 14]},
      {"key": "respiratory_renal", "label": "Respiratory and Renal/Urinary Systems", "share": [10, 14]},
      {"key": "gastrointestinal", "label": "Gastrointestinal System", "share": [7, 11]},
      {"key": "musculoskeletal_skin", "label": "Musculoskeletal, Skin and Subcutaneous Tissue", "share": [7, 11]},
      {"key": "blood_lymphoreticular", "label": "Blood and Lymphoreticular System", "share": [7, 11]},
      {"key": "behavioral_health", "label": "Behavioral Health and Nervous System", "share": [6, 10]},
      {"key": "multisystem", "label": "Multisystem Processes and Disorders", "share": [6, 10]},
      {"key": "biostatistics_epidemiology", "label": "Biostatistics, Epidemiology and Population Health", "share": [4, 6]},
      {"key": "social_sciences", "label": "Social Sciences, Ethics and Communication", "share": [6, 9]}
    ]
  }'::jsonb
)
on conflict (slug) do update
set name = excluded.name,
    provider = excluded.provider,
    disclaimer = excluded.disclaimer,
    configuration = excluded.configuration;

comment on column public.exam_definitions.configuration is
  'The exam shape, parsed by lib/examBlueprint.ts: section order, module sizes and timings, the quick-mode sample, each section score scale, how sections combine into a composite, and the marking scheme for exams that report raw marks rather than a scaled score. Changing an exam structure is an edit here, not a code deploy.';
