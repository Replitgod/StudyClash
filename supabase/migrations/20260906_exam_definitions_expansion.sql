-- Exams other than the SAT become real.
--
-- exam_definitions has held rows for the ACT, MCAT, GRE and AP since the
-- diagnostics centre was built, all of them `coming_soon` with `{}` for a
-- configuration and no questions behind them. /exams rendered them as cards
-- whose only button went to /home, where the student typed a topic and got
-- generic AI-generated practice. That is a decorative exam-prep card, which
-- is the specific thing this product must not ship.
--
-- What was actually missing was never the questions -- it was that the
-- engine could only describe one exam. The start route opened on a constant
-- `FIRST_SECTION = "reading_writing"`, quick-mode sizes were a two-key
-- record of the SAT's sections, and the score estimate added a
-- Reading-and-Writing band to a Math band. lib/examBlueprint.ts moved all
-- of that into the configuration column, so this migration is the other
-- half: the actual shapes.
--
-- Every structure below is from the exam board's own published
-- documentation, checked at the time of writing:
--
--   ACT       The enhanced ACT. English 50/35, Math 45/50, Reading 36/40,
--             all required; Science 40/40, optional. From September 2025
--             the Composite is the average of English, Math and Reading
--             ONLY -- Science is still reported on the 1-36 scale and still
--             feeds the STEM score, but is no longer part of the Composite,
--             which is why its section carries "inComposite": false.
--   MCAT      Four sections of 59/59/53/59 items, each scored 118-132, and
--             a total of 472-528. AAMC's published content outline.
--   GRE       The shortened General Test: two Verbal sections (12 then 15
--             items) and two Quantitative sections (12 then 15), each
--             scored 130-170. Section-level adaptive -- the second section's
--             difficulty depends on the first -- which is exactly what the
--             engine's two-module routing already does.
--   NCLEX-RN  The 2026 NCSBN test plan, effective April 2026. Minimum 85
--             items, maximum 150, five hours, and NO scaled score at all:
--             the real exam reports a pass/fail decision. The section
--             carries no score scale and the composite is "none", so
--             AceDecks reports readiness and accuracy and does not invent a
--             number the candidate will never be given.
--
-- The Analytical Writing task on the GRE and the essays on the ACT and AP
-- are deliberately absent from these blueprints: the diagnostic engine
-- grades selected responses, and a written task belongs in the open-response
-- flow rather than being faked as a multiple-choice item.
--
-- Nothing here is published as available until a bank exists behind it --
-- the status flips happen in the seed migrations, next to the questions, so
-- an exam can never be switched on with nothing to serve.
--
-- Safe to run more than once.

-- ============================================================
-- Multiple response, for the NCLEX
-- ============================================================

-- Select-all-that-apply is the NCLEX's central item type and the question
-- table could not store it. Graded as one all-or-nothing decision by
-- lib/examAnswer.ts, which is how the real exam scores a traditional SATA
-- item; the answer key is stored as the sorted choice ids, "A,C,D".
alter table if exists public.diagnostic_questions
  drop constraint if exists diagnostic_questions_question_type_check;

alter table if exists public.diagnostic_questions
  add constraint diagnostic_questions_question_type_check
  check (question_type in ('multiple_choice', 'student_produced_response', 'multiple_response'));

-- ============================================================
-- ACT
-- ============================================================

update public.exam_definitions
set
  name = 'ACT',
  provider = 'ACT, Inc.',
  configuration = '{
    "sections": [
      {
        "key": "english",
        "label": "English",
        "totalQuestions": 50,
        "totalMinutes": 35,
        "modules": [{"module": 1, "questions": 50, "minutes": 35}],
        "quick": {"questions": 12, "minutes": 9},
        "score": {"min": 1, "max": 36, "step": 1}
      },
      {
        "key": "math",
        "label": "Math",
        "totalQuestions": 45,
        "totalMinutes": 50,
        "modules": [{"module": 1, "questions": 45, "minutes": 50}],
        "quick": {"questions": 12, "minutes": 13},
        "score": {"min": 1, "max": 36, "step": 1}
      },
      {
        "key": "reading",
        "label": "Reading",
        "totalQuestions": 36,
        "totalMinutes": 40,
        "modules": [{"module": 1, "questions": 36, "minutes": 40}],
        "quick": {"questions": 10, "minutes": 11},
        "score": {"min": 1, "max": 36, "step": 1}
      },
      {
        "key": "science",
        "label": "Science",
        "totalQuestions": 40,
        "totalMinutes": 40,
        "modules": [{"module": 1, "questions": 40, "minutes": 40}],
        "quick": {"questions": 10, "minutes": 10},
        "score": {"min": 1, "max": 36, "step": 1},
        "inComposite": false,
        "note": "Optional on the enhanced ACT, and not part of the Composite since September 2025."
      }
    ],
    "breakMinutesBetweenSections": 10,
    "composite": {"kind": "average"},
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "The ACT is not adaptive. Each section is a single fixed module."
    },
    "scoreRange": {"min": 1, "max": 36, "sectionMin": 1, "sectionMax": 36}
  }'::jsonb
where slug = 'act';

-- ============================================================
-- MCAT
-- ============================================================

update public.exam_definitions
set
  provider = 'AAMC',
  configuration = '{
    "sections": [
      {
        "key": "chem_phys",
        "label": "Chemical and Physical Foundations of Biological Systems",
        "totalQuestions": 59,
        "totalMinutes": 95,
        "modules": [{"module": 1, "questions": 59, "minutes": 95}],
        "quick": {"questions": 10, "minutes": 16},
        "score": {"min": 118, "max": 132, "step": 1}
      },
      {
        "key": "cars",
        "label": "Critical Analysis and Reasoning Skills",
        "totalQuestions": 53,
        "totalMinutes": 90,
        "modules": [{"module": 1, "questions": 53, "minutes": 90}],
        "quick": {"questions": 9, "minutes": 15},
        "score": {"min": 118, "max": 132, "step": 1}
      },
      {
        "key": "bio_biochem",
        "label": "Biological and Biochemical Foundations of Living Systems",
        "totalQuestions": 59,
        "totalMinutes": 95,
        "modules": [{"module": 1, "questions": 59, "minutes": 95}],
        "quick": {"questions": 10, "minutes": 16},
        "score": {"min": 118, "max": 132, "step": 1}
      },
      {
        "key": "psych_soc",
        "label": "Psychological, Social, and Biological Foundations of Behavior",
        "totalQuestions": 59,
        "totalMinutes": 95,
        "modules": [{"module": 1, "questions": 59, "minutes": 95}],
        "quick": {"questions": 10, "minutes": 16},
        "score": {"min": 118, "max": 132, "step": 1}
      }
    ],
    "breakMinutesBetweenSections": 10,
    "composite": {"kind": "sum"},
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "The MCAT is not adaptive. Each section is a single fixed module."
    },
    "scoreRange": {"min": 472, "max": 528, "sectionMin": 118, "sectionMax": 132}
  }'::jsonb
where slug = 'mcat';

-- ============================================================
-- GRE
-- ============================================================

update public.exam_definitions
set
  provider = 'ETS',
  configuration = '{
    "sections": [
      {
        "key": "verbal",
        "label": "Verbal Reasoning",
        "totalQuestions": 27,
        "totalMinutes": 41,
        "modules": [
          {"module": 1, "questions": 12, "minutes": 18},
          {"module": 2, "questions": 15, "minutes": 23}
        ],
        "quick": {"questions": 10, "minutes": 15},
        "score": {"min": 130, "max": 170, "step": 1}
      },
      {
        "key": "quant",
        "label": "Quantitative Reasoning",
        "totalQuestions": 27,
        "totalMinutes": 47,
        "modules": [
          {"module": 1, "questions": 12, "minutes": 21},
          {"module": 2, "questions": 15, "minutes": 26}
        ],
        "quick": {"questions": 10, "minutes": 18},
        "score": {"min": 130, "max": 170, "step": 1}
      }
    ],
    "breakMinutesBetweenSections": 0,
    "composite": {"kind": "sum"},
    "adaptive": {
      "module2ThresholdAccuracy": 0.6,
      "note": "The GRE is section-level adaptive: the second section of each measure is chosen from how the first went. This threshold is AceDecks own and transparent, not a reproduction of ETS routing."
    },
    "scoreRange": {"min": 260, "max": 340, "sectionMin": 130, "sectionMax": 170}
  }'::jsonb
where slug = 'gre';

-- ============================================================
-- NCLEX-RN and NCLEX-PN
-- ============================================================

-- Neither existed as a row. /exams has advertised NCLEX since it was
-- written, and clicking it went to a page whose button went to /home.
insert into public.exam_definitions (slug, name, provider, status, disclaimer, configuration)
values
  (
    'nclex-rn',
    'NCLEX-RN',
    'NCSBN',
    'coming_soon',
    'AceDecks NCLEX-RN-style practice. Original questions written to the publicly published NCSBN test plan. Not affiliated with, endorsed by, or containing questions from NCSBN, and not a substitute for clinical judgement or professional advice.',
    '{
      "sections": [
        {
          "key": "nclex_rn",
          "label": "NCLEX-RN Practice",
          "totalQuestions": 85,
          "totalMinutes": 120,
          "modules": [{"module": 1, "questions": 85, "minutes": 120}],
          "quick": {"questions": 25, "minutes": 35}
        }
      ],
      "breakMinutesBetweenSections": 0,
      "composite": {"kind": "none"},
      "adaptive": {
        "module2ThresholdAccuracy": 0.6,
        "note": "The real NCLEX is item-level adaptive over a variable-length exam. AceDecks does not reproduce that, and reports accuracy and readiness rather than a simulated pass/fail decision."
      },
      "scoreRange": null,
      "contentAreas": [
        {"key": "management_of_care", "label": "Management of Care", "share": [15, 21]},
        {"key": "safety_infection_control", "label": "Safety and Infection Prevention and Control", "share": [10, 16]},
        {"key": "health_promotion", "label": "Health Promotion and Maintenance", "share": [6, 12]},
        {"key": "psychosocial_integrity", "label": "Psychosocial Integrity", "share": [6, 12]},
        {"key": "basic_care_comfort", "label": "Basic Care and Comfort", "share": [6, 12]},
        {"key": "pharmacological_therapies", "label": "Pharmacological and Parenteral Therapies", "share": [13, 19]},
        {"key": "reduction_of_risk", "label": "Reduction of Risk Potential", "share": [9, 15]},
        {"key": "physiological_adaptation", "label": "Physiological Adaptation", "share": [11, 17]}
      ]
    }'::jsonb
  ),
  (
    'nclex-pn',
    'NCLEX-PN',
    'NCSBN',
    'coming_soon',
    'AceDecks NCLEX-PN-style practice. Original questions written to the publicly published NCSBN test plan. Not affiliated with, endorsed by, or containing questions from NCSBN, and not a substitute for clinical judgement or professional advice.',
    '{
      "sections": [
        {
          "key": "nclex_pn",
          "label": "NCLEX-PN Practice",
          "totalQuestions": 85,
          "totalMinutes": 120,
          "modules": [{"module": 1, "questions": 85, "minutes": 120}],
          "quick": {"questions": 20, "minutes": 28}
        }
      ],
      "breakMinutesBetweenSections": 0,
      "composite": {"kind": "none"},
      "adaptive": {
        "module2ThresholdAccuracy": 0.6,
        "note": "The real NCLEX is item-level adaptive over a variable-length exam. AceDecks does not reproduce that."
      },
      "scoreRange": null
    }'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  provider = excluded.provider,
  disclaimer = excluded.disclaimer,
  configuration = excluded.configuration;

-- ============================================================
-- Disclaimers, restated per board
-- ============================================================

-- Every row shared one sentence naming every board at once, which read as
-- boilerplate and named organisations that had nothing to do with the exam
-- in front of the student. One disclaimer per exam, naming that exam's
-- board and no other.
update public.exam_definitions
set disclaimer = 'AceDecks ACT-style practice. Original questions written to ACT''s published test specification. Not affiliated with or endorsed by ACT, Inc., and not official ACT content.'
where slug = 'act';

update public.exam_definitions
set disclaimer = 'AceDecks MCAT-style practice. Original passages and questions written to the AAMC''s published content outline. Not affiliated with or endorsed by the AAMC, and not official MCAT content.'
where slug = 'mcat';

update public.exam_definitions
set disclaimer = 'AceDecks GRE-style practice. Original questions written to the ETS published test structure. Not affiliated with or endorsed by ETS, and not official GRE content.'
where slug = 'gre';

update public.exam_definitions
set disclaimer = 'AceDecks SAT-style practice. Original questions written to College Board''s published Digital SAT specification. Not affiliated with or endorsed by College Board, and not official SAT content. Score estimates are AceDecks own and are not College Board scores.'
where slug = 'digital-sat';

comment on column public.exam_definitions.configuration is
  'The exam shape, parsed by lib/examBlueprint.ts: section order, module sizes and timings, the quick-mode sample, each section score scale, and how sections combine into a composite. Changing an exam structure is an edit here, not a code deploy.';
