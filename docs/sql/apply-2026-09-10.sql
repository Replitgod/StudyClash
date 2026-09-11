-- AceDecks: apply 2026-09-10
--
-- Run this whole file in one paste, top to bottom. The ORDER matters and
-- fails quietly if shuffled: 02 creates the exam_definitions rows that the
-- bank files attach to by slug, and a bank insert that finds no matching
-- exam inserts nothing -- no error, no questions, and an exam that stays
-- switched off for no visible reason.
--
-- 01 and 06 stand alone. 01 adds the columns that let a processed course
-- become a study deck; 06 adds the column that stores a raw-marks result
-- for JEE and NEET.
--
-- 07 and 08 are the hard tiers. They only add questions, so they are safe
-- to run on a database that already has the earlier banks.
--
-- Every statement is idempotent. Running this twice is safe, and re-running
-- it after applying part of it is safe too.


-- ======================================================================
-- FILE: 20260910_01_curriculum_deck_bridge.sql
-- ======================================================================

-- Let a processed course become a deck a student actually reviews.
--
-- The curriculum pipeline and the study app have been two separate systems
-- sharing a database. A document went through eight stages and produced
-- rows in `curriculum_questions`; nothing in the study app has ever read
-- that table. The course page could list a concept's questions with the
-- answers visible, which is reading, not retrieval practice.
--
-- The consequence was quiet and expensive: nothing a student uploaded ever
-- entered the SM-2 schedule, counted toward mastery, or reached Vyra. The
-- question the whole product is built to answer -- "what am I forgetting?"
-- -- structurally could not include a student's own material.
--
-- Two columns are enough to bridge it, because the two schemas already
-- agree on the important convention: both store a multiple choice answer as
-- the choice's TEXT rather than a letter, so no answer-key translation is
-- involved and there is no opportunity to get one wrong.
--
-- Safe to run more than once.

-- ============================================================
-- Which course a deck was built from
-- ============================================================

-- Nullable because almost no deck has a course: decks made from a pasted
-- topic, an Anki import, or a Quizlet set have no upstream course and never
-- will. `on delete set null` rather than cascade -- deleting a course must
-- not delete a deck the student has been reviewing for weeks. They lose the
-- ability to sync new cards in, not their study history.
alter table public.decks
  add column if not exists source_course_id uuid references public.courses(id) on delete set null;

create index if not exists idx_decks_source_course
  on public.decks(source_course_id)
  where source_course_id is not null;

comment on column public.decks.source_course_id is
  'The curriculum course this deck was built from, when it was built from one. Null for decks created from a topic, an import, or pasted notes.';

-- ============================================================
-- Which generated question a card came from
-- ============================================================

-- This is what makes syncing idempotent. Uploading chapter two and
-- rebuilding should add the new cards and leave the existing ones alone --
-- including their review schedule, ease factors and streaks, which live on
-- question_review_schedule keyed by question_id. Without this link the only
-- way to "rebuild" a deck would be to delete and recreate its cards, which
-- would silently reset every SM-2 interval the student had earned.
alter table public.questions
  add column if not exists source_curriculum_question_id uuid
    references public.curriculum_questions(id) on delete set null;

-- Partial unique: one card per generated question, while leaving the
-- overwhelming majority of cards (which have no curriculum source) free to
-- hold null without colliding with each other.
create unique index if not exists questions_source_curriculum_question_unique
  on public.questions(source_curriculum_question_id)
  where source_curriculum_question_id is not null;

comment on column public.questions.source_curriculum_question_id is
  'The curriculum_questions row this card was generated from. Makes a course-to-deck sync idempotent: an existing card is left untouched, preserving its SM-2 schedule, rather than being deleted and recreated.';


-- ======================================================================
-- FILE: 20260910_02_jee_neet_usmle_definitions.sql
-- ======================================================================

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


-- ======================================================================
-- FILE: 20260910_03_jee_main_question_bank.sql
-- ======================================================================

-- An original JEE Main question bank.
--
-- Every item was written for this file. Nothing reproduces, paraphrases or
-- is derived from an NTA paper -- past JEE papers are copyrighted and the
-- copies circulating online are not licensed material. What is taken from
-- the NTA is the published pattern (25 items per subject, 20 multiple choice
-- and 5 numerical, +4/-1) and the NCERT syllabus those items are drawn from.
--
-- Two constraints shaped the content:
--
-- Every answer here is checkable by hand in under a minute. That is
-- deliberate -- an item whose key I cannot verify from first principles is
-- an item I should not be shipping to someone sitting an engineering
-- entrance exam. The numbers are chosen to come out clean for the same
-- reason.
--
-- Distractors are wrong ANSWERS, not wrong topics. Each one is where a
-- specific, common error lands: forgetting to resolve a component, using
-- diameter for radius, dropping a factor of two from an integral. A
-- distractor nobody would pick is a wasted option and turns a four-option
-- item into a two-option one.
--
-- GENERATED by scripts/build-bank-sql.mjs from scripts/banks/jeeMain.ts. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  ('physics', 'Kinematics', 'Projectile motion', 'easy', 'multiple_choice',
   null,
   'A ball is thrown at 20 m/s at 30 degrees above the horizontal. Taking g as 10 m/s squared, what is the maximum height it reaches?',
   '[{"id":"A","text":"5 m"},{"id":"B","text":"10 m"},{"id":"C","text":"20 m"},{"id":"D","text":"2.5 m"}]',
   'A', 'Only the vertical component decides the height. It is 20 sin 30, which is 10 m/s, and the ball rises until that is spent: h equals v squared over 2g, so 100 over 20, which is 5 m. Choosing 20 m is what happens if you use the full 20 m/s instead of resolving it first -- the single most common slip on this item type.'),

  ('physics', 'Laws of motion', 'Motion on an incline', 'easy', 'multiple_choice',
   null,
   'A block slides down a frictionless incline of 30 degrees. Taking g as 10 m/s squared, what is its acceleration along the incline?',
   '[{"id":"A","text":"10 m/s squared"},{"id":"B","text":"5 m/s squared"},{"id":"C","text":"8.7 m/s squared"},{"id":"D","text":"Zero"}]',
   'B', 'The component of gravity along the surface is g sin theta, so 10 times 0.5, which is 5 m/s squared. The 8.7 option is g cos 30 -- the component pressing into the surface, which the normal force cancels and which never drives the slide.'),

  ('physics', 'Work, energy and power', 'Work-energy theorem', 'easy', 'multiple_choice',
   null,
   'A constant force of 8 N acts through 4 m on a 4 kg block initially at rest on a frictionless surface. What is its final speed?',
   '[{"id":"A","text":"2 m/s"},{"id":"B","text":"8 m/s"},{"id":"C","text":"4 m/s"},{"id":"D","text":"16 m/s"}]',
   'C', 'Work done is 8 times 4, which is 32 J, and with no friction all of it becomes kinetic energy. Setting half m v squared equal to 32 with m of 4 gives v squared of 16, so v is 4 m/s. This is faster than finding the acceleration first, and the work-energy theorem is usually the shortcut whenever a question gives force and distance rather than force and time.'),

  ('physics', 'Rotational motion', 'Rolling without slipping', 'hard', 'multiple_choice',
   null,
   'A solid sphere rolls without slipping. What fraction of its total kinetic energy is rotational?',
   '[{"id":"A","text":"1/2"},{"id":"B","text":"5/7"},{"id":"C","text":"2/5"},{"id":"D","text":"2/7"}]',
   'D', 'For a solid sphere the moment of inertia is two fifths m r squared, and rolling without slipping means omega equals v over r. Rotational energy is then one fifth m v squared and translational is one half m v squared, giving seven tenths m v squared in total. The rotational share is one fifth divided by seven tenths, which is two sevenths. Choosing 2/5 is quoting the moment of inertia coefficient rather than computing the ratio.'),

  ('physics', 'Oscillations', 'Simple harmonic motion', 'medium', 'multiple_choice',
   null,
   'A mass on a spring has period T. If the mass is made four times larger and the spring is unchanged, the new period is:',
   '[{"id":"A","text":"2T"},{"id":"B","text":"4T"},{"id":"C","text":"T/2"},{"id":"D","text":"T"}]',
   'A', 'The period is two pi times the square root of m over k, so it depends on the square root of the mass. Four times the mass multiplies the period by the square root of four, which is two. Answering 4T treats the relationship as linear, which is the error this item is built to catch.'),

  ('physics', 'Thermodynamics', 'First law', 'medium', 'multiple_choice',
   null,
   'An ideal gas expands isothermally and reversibly. Which statement is correct?',
   '[{"id":"A","text":"The heat absorbed equals the change in internal energy"},{"id":"B","text":"The heat absorbed equals the work done by the gas"},{"id":"C","text":"No heat is exchanged with the surroundings"},{"id":"D","text":"The work done by the gas is zero"}]',
   'B', 'Internal energy of an ideal gas depends only on temperature, so an isothermal change means the internal energy change is zero. The first law then reduces to heat in equals work out. The option about no heat exchange describes an adiabatic process, which is a different constraint entirely.'),

  ('physics', 'Electrostatics', 'Coulomb''s law', 'easy', 'multiple_choice',
   null,
   'Two point charges attract each other with force F. If the separation between them is doubled and the charges are unchanged, the new force is:',
   '[{"id":"A","text":"2F"},{"id":"B","text":"F/2"},{"id":"C","text":"F/4"},{"id":"D","text":"4F"}]',
   'C', 'Coulomb''s law is an inverse square law, so doubling the separation divides the force by four. Answering F/2 treats it as inverse linear, which is the trap; the same reasoning applies to gravitation, which is why this relationship is worth being automatic about.'),

  ('physics', 'Current electricity', 'Resistors in parallel', 'easy', 'multiple_choice',
   null,
   'A 6 ohm resistor and a 3 ohm resistor are connected in parallel. What is the equivalent resistance?',
   '[{"id":"A","text":"18 ohm"},{"id":"B","text":"9 ohm"},{"id":"C","text":"4.5 ohm"},{"id":"D","text":"2 ohm"}]',
   'D', 'For two resistors in parallel the equivalent is the product over the sum: 18 over 9, which is 2 ohm. A useful check is that a parallel combination is always smaller than the smallest resistor present, so 4.5 and 9 can be rejected on sight without any arithmetic.'),

  ('physics', 'Ray optics', 'Thin lens imaging', 'medium', 'multiple_choice',
   null,
   'An object is placed at a distance of twice the focal length from a converging lens. The image formed is:',
   '[{"id":"A","text":"real, inverted and the same size as the object"},{"id":"B","text":"virtual, upright and magnified"},{"id":"C","text":"real, inverted and magnified"},{"id":"D","text":"virtual, inverted and diminished"}]',
   'A', 'Putting u at 2f into the lens equation gives v at 2f on the far side, so the magnification is exactly one. This is the crossover case: closer than 2f the image is magnified, further away it is diminished. Note also that a real image from a single converging lens is always inverted, which makes the virtual-and-inverted option impossible on its own terms.'),

  ('physics', 'Modern physics', 'Photoelectric effect', 'medium', 'multiple_choice',
   null,
   'In a photoelectric experiment, increasing the intensity of the incident light while keeping its frequency fixed will:',
   '[{"id":"A","text":"increase the maximum kinetic energy of the photoelectrons"},{"id":"B","text":"increase the number of photoelectrons but not their maximum kinetic energy"},{"id":"C","text":"increase both the number and the maximum kinetic energy"},{"id":"D","text":"have no effect on the emitted photoelectrons"}]',
   'B', 'Intensity is the number of photons per second, so it sets how many electrons are ejected. The energy each electron carries away comes from a single photon and depends on frequency alone, through h nu minus the work function. This split is the whole reason the photoelectric effect could not be explained by a wave picture, in which brighter light should have meant faster electrons.'),

  ('physics', 'Kinetic theory', 'Molecular speeds', 'hard', 'multiple_choice',
   null,
   'The root mean square speed of oxygen molecules at temperature T is v. At the same temperature, the rms speed of hydrogen molecules, which have one sixteenth the molar mass, is:',
   '[{"id":"A","text":"v/4"},{"id":"B","text":"16v"},{"id":"C","text":"4v"},{"id":"D","text":"v"}]',
   'C', 'The rms speed goes as the square root of T over M. At the same temperature only the mass matters, and one sixteenth the mass means four times the speed. Answering 16v forgets the square root; this is also why light gases escape a planet''s atmosphere preferentially.'),

  ('physics', 'Electromagnetic induction', 'Lenz''s law', 'medium', 'multiple_choice',
   null,
   'A bar magnet is pushed north-pole-first towards a closed conducting loop. The induced current in the loop, viewed from the magnet''s side, flows so as to:',
   '[{"id":"A","text":"be zero, because the loop has no source of emf"},{"id":"B","text":"assist the approach, presenting a south pole towards the magnet"},{"id":"C","text":"flow only after the magnet stops moving"},{"id":"D","text":"oppose the approach, presenting a north pole towards the magnet"}]',
   'D', 'Lenz''s law says the induced effect opposes the change producing it, so the loop presents a like pole and repels the incoming magnet. The alternative would have the loop pull the magnet in, accelerating it, producing more current, and creating energy from nothing. The loop''s emf is the changing flux itself, which is why the last option is wrong.'),

  ('chemistry', 'Some basic concepts', 'Mole concept', 'easy', 'multiple_choice',
   null,
   'How many moles of carbon dioxide are present in 88 g of the gas? (Molar mass 44 g/mol)',
   '[{"id":"A","text":"2 mol"},{"id":"B","text":"1 mol"},{"id":"C","text":"4 mol"},{"id":"D","text":"0.5 mol"}]',
   'A', 'Moles are mass divided by molar mass: 88 over 44, which is 2. Answering 0.5 inverts the division, which is worth guarding against by sanity check -- a sample heavier than one molar mass must contain more than one mole.'),

  ('chemistry', 'Periodic properties', 'Ionisation enthalpy', 'medium', 'multiple_choice',
   null,
   'Which correctly describes the trend in first ionisation enthalpy on moving left to right across a period?',
   '[{"id":"A","text":"It generally decreases, because atomic radius decreases"},{"id":"B","text":"It generally increases, because nuclear charge rises while shielding stays nearly constant"},{"id":"C","text":"It stays constant, because the number of shells does not change"},{"id":"D","text":"It generally decreases, because electrons are added to the same shell"}]',
   'B', 'Across a period the added electrons enter the same shell, so they shield each other poorly while the nuclear charge keeps climbing. The outer electrons are held more tightly and are harder to remove. Note that a smaller radius makes removal harder, not easier, which is why the second option has the right fact attached to the wrong conclusion.'),

  ('chemistry', 'Chemical bonding', 'VSEPR and hybridisation', 'medium', 'multiple_choice',
   null,
   'Ammonia has a bond angle of about 107 degrees rather than the 109.5 degrees of a regular tetrahedron. The best explanation is that:',
   '[{"id":"A","text":"the N-H bonds are shorter than a tetrahedral geometry requires"},{"id":"B","text":"nitrogen is sp2 hybridised rather than sp3"},{"id":"C","text":"the lone pair repels the bonding pairs more strongly than they repel each other"},{"id":"D","text":"hydrogen atoms repel one another more strongly than the lone pair does"}]',
   'C', 'Nitrogen is sp3 hybridised with four electron domains, but one is a lone pair. A lone pair is held closer to the nucleus and spreads out more, so it squeezes the three bonding pairs together and the angle closes slightly below the ideal. The same reasoning predicts the further reduction to about 104.5 degrees in water, which has two lone pairs.'),

  ('chemistry', 'Chemical kinetics', 'First-order reactions', 'medium', 'multiple_choice',
   null,
   'For a first-order reaction, the half-life is:',
   '[{"id":"A","text":"proportional to the square of the initial concentration"},{"id":"B","text":"directly proportional to the initial concentration"},{"id":"C","text":"inversely proportional to the initial concentration"},{"id":"D","text":"independent of the initial concentration"}]',
   'D', 'For first order, the half-life is 0.693 over k, and no concentration term appears. This is why radioactive decay has a fixed half-life regardless of sample size. It is specific to first order: a second-order half-life does depend on the starting concentration, so the property is a useful way to identify the order from data.'),

  ('chemistry', 'Organic chemistry', 'Nucleophilic substitution', 'hard', 'multiple_choice',
   null,
   'Tertiary alkyl halides undergo substitution predominantly by the SN1 mechanism rather than SN2 mainly because:',
   '[{"id":"A","text":"the tertiary carbocation intermediate is stabilised and the crowded carbon blocks backside attack"},{"id":"B","text":"tertiary halides have unusually weak carbon-halogen bonds"},{"id":"C","text":"the nucleophile is more reactive towards tertiary carbon"},{"id":"D","text":"SN2 requires a carbocation, which tertiary halides cannot form"}]',
   'A', 'Two effects push the same way. Electronically, three alkyl groups donate electron density and stabilise the carbocation that SN1 must form. Sterically, those same groups block the backside approach SN2 needs. The last option inverts the mechanisms: it is SN1 that goes through a carbocation, while SN2 is a single concerted step with no intermediate at all.'),

  ('chemistry', 'Organic chemistry', 'Structural isomerism', 'easy', 'multiple_choice',
   null,
   'How many structural isomers does butane, C4H10, have?',
   '[{"id":"A","text":"3"},{"id":"B","text":"2"},{"id":"C","text":"4"},{"id":"D","text":"1"}]',
   'B', 'There are two: the straight chain n-butane, and the branched isobutane, which is 2-methylpropane. Drawing what looks like a third by bending the chain on paper is the usual error -- a bent chain is the same molecule viewed differently, since a structural isomer requires a genuinely different connectivity.'),

  ('chemistry', 'Thermodynamics', 'Gibbs free energy', 'medium', 'multiple_choice',
   null,
   'A reaction is endothermic and results in an increase in entropy. It will be spontaneous:',
   '[{"id":"A","text":"at all temperatures"},{"id":"B","text":"at low temperatures only"},{"id":"C","text":"at high temperatures only"},{"id":"D","text":"at no temperature"}]',
   'C', 'Spontaneity requires a negative change in Gibbs energy, which is delta H minus T delta S. Here delta H is positive, which works against it, but delta S is also positive, so the minus T delta S term becomes more negative as temperature rises. Above a threshold temperature the entropy term wins. This is precisely why ice melts spontaneously above zero degrees and not below it.'),

  ('chemistry', 'Coordination compounds', 'Oxidation state', 'easy', 'multiple_choice',
   null,
   'What is the oxidation state of cobalt in the complex ion hexaamminecobalt(III), written as Co(NH3)6 with an overall charge of 3+?',
   '[{"id":"A","text":"0"},{"id":"B","text":"+2"},{"id":"C","text":"+6"},{"id":"D","text":"+3"}]',
   'D', 'Ammonia is a neutral ligand, contributing nothing to the charge, so the metal must carry the entire 3+ by itself. Answering +6 comes from counting the six ligands rather than their charge; the count of ligands is the coordination number, which is a separate property from oxidation state.'),

  ('chemistry', 'Equilibrium', 'Le Chatelier''s principle', 'medium', 'multiple_choice',
   null,
   'For the equilibrium N2(g) + 3H2(g) in balance with 2NH3(g), which change shifts the position of equilibrium towards ammonia?',
   '[{"id":"A","text":"Increasing the total pressure"},{"id":"B","text":"Decreasing the total pressure"},{"id":"C","text":"Adding a catalyst"},{"id":"D","text":"Increasing the volume of the vessel"}]',
   'A', 'There are four moles of gas on the left and two on the right, so raising the pressure favours the side that occupies less volume. A catalyst is worth singling out: it speeds both directions equally and changes how fast equilibrium arrives, never where it sits. Increasing the volume is the same as lowering the pressure, so it shifts the other way.'),

  ('chemistry', 'Solutions', 'Colligative properties', 'hard', 'multiple_choice',
   null,
   'Equimolar aqueous solutions of glucose and sodium chloride are compared. The depression in freezing point of the sodium chloride solution is approximately:',
   '[{"id":"A","text":"the same as that of the glucose solution"},{"id":"B","text":"twice that of the glucose solution"},{"id":"C","text":"half that of the glucose solution"},{"id":"D","text":"unrelated, because the two solutes differ chemically"}]',
   'B', 'Colligative properties count dissolved particles rather than caring what they are. Glucose dissolves as single molecules, while sodium chloride dissociates into two ions, so an equimolar solution contains roughly twice as many particles and depresses the freezing point about twice as much. This particle count is the van''t Hoff factor, and it is the whole reason salt is spread on icy roads rather than sugar.'),

  ('chemistry', 'Electrochemistry', 'Electrode potential', 'medium', 'multiple_choice',
   null,
   'In a galvanic cell operating spontaneously, the electrode at which oxidation occurs is:',
   '[{"id":"A","text":"the anode, which is the positive terminal"},{"id":"B","text":"the cathode, which is the negative terminal"},{"id":"C","text":"the anode, which is the negative terminal"},{"id":"D","text":"the cathode, which is the positive terminal"}]',
   'C', 'Oxidation always happens at the anode, in every cell, by definition. What flips between galvanic and electrolytic cells is the sign: in a galvanic cell the anode releases electrons into the external circuit and is therefore negative, while in electrolysis the anode is driven positive by the supply. Tying the sign to the process rather than memorising it is what stops this being confusing.'),

  ('chemistry', 'Organic chemistry', 'Aromaticity', 'hard', 'multiple_choice',
   null,
   'According to Huckel''s rule, a planar cyclic conjugated species is aromatic when its delocalised system contains:',
   '[{"id":"A","text":"any even number of pi electrons"},{"id":"B","text":"4n pi electrons, where n is a positive integer"},{"id":"C","text":"exactly six pi electrons in all cases"},{"id":"D","text":"4n + 2 pi electrons, where n is zero or a positive integer"}]',
   'D', 'The count is 4n + 2, giving the aromatic series 2, 6, 10 and so on. Benzene is the familiar case at six, but the cyclopropenyl cation is aromatic with two, which is why the exactly-six option is too narrow. A 4n count such as cyclobutadiene''s four is antiaromatic and markedly unstable, so the even-number option is wrong in a way that matters.'),

  ('mathematics', 'Quadratic equations', 'Sum and product of roots', 'easy', 'multiple_choice',
   null,
   'If the roots of x squared minus 5x + 6 equal zero are alpha and beta, what is the value of alpha squared plus beta squared?',
   '[{"id":"A","text":"13"},{"id":"B","text":"25"},{"id":"C","text":"12"},{"id":"D","text":"1"}]',
   'A', 'The sum of the roots is 5 and the product is 6. Using the identity that alpha squared plus beta squared equals the sum squared minus twice the product gives 25 minus 12, which is 13. Answering 25 stops at the sum squared and forgets to subtract; the identity is worth knowing because it avoids solving for the roots at all.'),

  ('mathematics', 'Sequences and series', 'Arithmetic progression', 'easy', 'multiple_choice',
   null,
   'What is the sum of the first 20 terms of the arithmetic progression 3, 7, 11, 15, ...?',
   '[{"id":"A","text":"800"},{"id":"B","text":"820"},{"id":"C","text":"410"},{"id":"D","text":"1640"}]',
   'B', 'The first term is 3 and the common difference is 4. The sum of n terms is n over 2 times twice the first term plus n minus one times d, giving 10 times 6 plus 76, which is 10 times 82, so 820. Answering 410 is the result of dropping the factor from n over 2.'),

  ('mathematics', 'Calculus', 'Differentiation', 'medium', 'multiple_choice',
   null,
   'What is the derivative of x squared times sin x with respect to x?',
   '[{"id":"A","text":"x squared cos x"},{"id":"B","text":"2x cos x"},{"id":"C","text":"2x sin x + x squared cos x"},{"id":"D","text":"2x sin x - x squared cos x"}]',
   'C', 'This is a product, so the product rule applies: the derivative of the first times the second, plus the first times the derivative of the second. That gives 2x sin x plus x squared cos x. The two shorter options each differentiate one factor and forget the other, which is the error the product rule exists to prevent.'),

  ('mathematics', 'Calculus', 'Definite integration', 'medium', 'multiple_choice',
   null,
   'What is the value of the definite integral of sin x from 0 to pi?',
   '[{"id":"A","text":"pi"},{"id":"B","text":"0"},{"id":"C","text":"1"},{"id":"D","text":"2"}]',
   'D', 'The antiderivative of sin x is minus cos x. Evaluating from 0 to pi gives minus cos pi minus minus cos 0, which is 1 plus 1, so 2. Answering 0 is what you get by integrating over a full period from 0 to 2 pi, where the positive and negative halves cancel -- over 0 to pi the curve is entirely above the axis, so the area cannot be zero.'),

  ('mathematics', 'Probability', 'Conditional probability', 'hard', 'multiple_choice',
   null,
   'Two fair dice are rolled. Given that the sum is 8, what is the probability that at least one die shows a 5?',
   '[{"id":"A","text":"2/5"},{"id":"B","text":"1/5"},{"id":"C","text":"1/3"},{"id":"D","text":"2/9"}]',
   'A', 'The outcomes summing to 8 are (2,6), (3,5), (4,4), (5,3) and (6,2), so five equally likely cases. Two of them contain a 5, giving two fifths. The common mistake is to use the unconditional probability of rolling a 5; being told the sum restricts the sample space to those five outcomes, and every conditional probability question turns on rebuilding that space correctly.'),

  ('mathematics', 'Complex numbers', 'Modulus and powers', 'medium', 'multiple_choice',
   null,
   'What is the value of i raised to the power 2026?',
   '[{"id":"A","text":"1"},{"id":"B","text":"-1"},{"id":"C","text":"i"},{"id":"D","text":"-i"}]',
   'B', 'Powers of i repeat with period four, so only the remainder on division by four matters. 2026 leaves a remainder of 2, and i squared is minus 1. Reducing the exponent modulo four turns any power of i into one of four cases and makes this instant.'),

  ('mathematics', 'Matrices and determinants', 'Determinant properties', 'medium', 'multiple_choice',
   null,
   'If A is a 3 by 3 matrix with determinant 4, what is the determinant of 2A?',
   '[{"id":"A","text":"4"},{"id":"B","text":"8"},{"id":"C","text":"32"},{"id":"D","text":"64"}]',
   'C', 'Scaling a matrix multiplies every one of its n rows by the scalar, so the determinant is multiplied by the scalar to the power n. Here that is 2 cubed times 4, which is 32. Answering 8 applies the factor only once, which is the standard trap on this identity.'),

  ('mathematics', 'Coordinate geometry', 'Straight lines', 'easy', 'multiple_choice',
   null,
   'What is the slope of a line perpendicular to the line 2x + 3y = 6?',
   '[{"id":"A","text":"2/3"},{"id":"B","text":"-2/3"},{"id":"C","text":"-3/2"},{"id":"D","text":"3/2"}]',
   'D', 'Rearranging gives y equals minus two thirds x plus 2, so the slope is minus two thirds. Perpendicular slopes multiply to minus one, so the answer is the negative reciprocal, three halves. Answering minus two thirds gives the slope of the original line rather than the perpendicular one.'),

  ('mathematics', 'Calculus', 'Limits', 'medium', 'multiple_choice',
   null,
   'What is the limit of sin(3x) divided by x as x approaches zero?',
   '[{"id":"A","text":"3"},{"id":"B","text":"1"},{"id":"C","text":"0"},{"id":"D","text":"1/3"}]',
   'A', 'The standard limit is that sin u over u tends to 1. Writing sin 3x over x as 3 times sin 3x over 3x makes the inner quotient tend to 1, leaving 3. Answering 1 applies the standard limit without accounting for the coefficient inside the sine.'),

  ('mathematics', 'Binomial theorem', 'General term', 'hard', 'multiple_choice',
   null,
   'What is the coefficient of x cubed in the expansion of (1 + x) to the power 6?',
   '[{"id":"A","text":"15"},{"id":"B","text":"20"},{"id":"C","text":"6"},{"id":"D","text":"120"}]',
   'B', 'The coefficient is 6 choose 3, which is 6 factorial over 3 factorial times 3 factorial, so 720 over 36, giving 20. Answering 120 computes a permutation instead of a combination; order does not matter when selecting which factors contribute an x, so the division by 3 factorial is required.'),

  ('mathematics', 'Vectors', 'Scalar product', 'medium', 'multiple_choice',
   null,
   'For non-zero vectors a and b, the scalar product a dot b equals zero implies that:',
   '[{"id":"A","text":"at least one of a and b is the zero vector"},{"id":"B","text":"a and b are parallel"},{"id":"C","text":"a and b are perpendicular"},{"id":"D","text":"a and b are equal in magnitude"}]',
   'C', 'The scalar product is the product of the magnitudes times cos theta. With both vectors non-zero, the product vanishes only when cos theta is zero, which means an angle of 90 degrees. Parallel vectors are the opposite case, where cos theta is one and the scalar product is at its maximum.'),

  ('mathematics', 'Trigonometry', 'Identities', 'easy', 'multiple_choice',
   null,
   'What is the exact value of sin 75 degrees?',
   '[{"id":"A","text":"1/2"},{"id":"B","text":"(square root of 6 minus square root of 2) divided by 4"},{"id":"C","text":"(square root of 3 plus 1) divided by 2"},{"id":"D","text":"(square root of 6 plus square root of 2) divided by 4"}]',
   'D', 'Write 75 as 45 plus 30 and expand: sin 45 cos 30 plus cos 45 sin 30. That gives root 6 over 4 plus root 2 over 4, so root 6 plus root 2 all over 4. The option with a minus sign is sin 15 degrees, which comes from the same expansion with 45 minus 30 -- a quick sanity check is that sin 75 must be close to 1, and this value is about 0.966.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'jee-main'
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = 'jee-main';


-- ======================================================================
-- FILE: 20260910_04_neet_ug_question_bank.sql
-- ======================================================================

-- An original NEET UG question bank.
--
-- Every item was written for this file. Nothing reproduces, paraphrases or is
-- derived from an NTA paper. What is taken from the NTA is the published 2026
-- pattern -- 180 compulsory questions, Physics 45, Chemistry 45, Biology 90,
-- at +4 and -1 -- and the NCERT syllabus the paper is drawn from.
--
-- Biology carries half the paper and is weighted accordingly here. That is
-- not padding: Biology is 360 of the 720 marks, and a NEET bank that treats
-- it as one subject among three trains the wrong allocation of attention.
--
-- Explanations name the answer by its CONTENT rather than by its letter
-- ("the option giving two ions"), because the keys are redistributed at build
-- time. An explanation that says "option B" is one rebalance away from
-- arguing for a letter that is no longer the key.
--
-- GENERATED by scripts/build-bank-sql.mjs from scripts/banks/neetUg.ts. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  ('physics', 'Laws of motion', 'Friction', 'easy', 'multiple_choice',
   null,
   'A block of mass 2 kg rests on a horizontal surface with coefficient of static friction 0.4. Taking g as 10 m/s squared, what is the maximum friction force before it begins to slide?',
   '[{"id":"A","text":"8 N"},{"id":"B","text":"20 N"},{"id":"C","text":"0.8 N"},{"id":"D","text":"5 N"}]',
   'A', 'Limiting friction is the coefficient times the normal force. The normal force here is the weight, 2 times 10, which is 20 N, so the maximum friction is 0.4 times 20, giving 8 N. Answering 20 N quotes the normal force itself and forgets to apply the coefficient.'),

  ('physics', 'Work, energy and power', 'Conservation of energy', 'medium', 'multiple_choice',
   null,
   'A body is dropped from rest at a height of 20 m. Ignoring air resistance and taking g as 10 m/s squared, what is its speed just before it hits the ground?',
   '[{"id":"A","text":"10 m/s"},{"id":"B","text":"20 m/s"},{"id":"C","text":"40 m/s"},{"id":"D","text":"200 m/s"}]',
   'B', 'All the potential energy becomes kinetic, so mgh equals half m v squared and the mass cancels. That leaves v squared equal to 2gh, which is 2 times 10 times 20, or 400, so the speed is 20 m/s. The mass cancelling is the point worth carrying away: a heavy and a light body arrive together in the absence of air resistance.'),

  ('physics', 'Current electricity', 'Ohm''s law and power', 'medium', 'multiple_choice',
   null,
   'A 60 W bulb is designed for 120 V. What is its resistance when operating normally?',
   '[{"id":"A","text":"120 ohm"},{"id":"B","text":"2 ohm"},{"id":"C","text":"240 ohm"},{"id":"D","text":"7200 ohm"}]',
   'C', 'Power equals V squared over R, so R is V squared over P: 14400 divided by 60, which is 240 ohm. Answering 2 ohm comes from dividing voltage by power, which is not a form of Ohm''s law and does not have units of resistance -- a dimension check catches it immediately.'),

  ('physics', 'Optics', 'Refraction', 'medium', 'multiple_choice',
   null,
   'Light passes from air into glass. Which quantity remains unchanged?',
   '[{"id":"A","text":"Direction of travel"},{"id":"B","text":"Speed"},{"id":"C","text":"Wavelength"},{"id":"D","text":"Frequency"}]',
   'D', 'Frequency is set by the source and cannot change at a boundary; if it did, wave crests would have to pile up or vanish at the interface. Speed falls in the denser medium, and since speed equals frequency times wavelength, the wavelength falls with it. The direction changes too, unless the light arrives along the normal.'),

  ('physics', 'Modern physics', 'Nuclear binding energy', 'hard', 'multiple_choice',
   null,
   'Energy is released in both nuclear fission of heavy nuclei and fusion of light nuclei because in each case the products have:',
   '[{"id":"A","text":"a higher binding energy per nucleon than the reactants"},{"id":"B","text":"a lower binding energy per nucleon than the reactants"},{"id":"C","text":"more nucleons in total than the reactants"},{"id":"D","text":"a greater total mass than the reactants"}]',
   'A', 'Binding energy per nucleon peaks near iron. Moving towards that peak from either direction -- splitting something heavier or combining something lighter -- gives products that are more tightly bound, and the difference is released. The mass option is the wrong way round: the products are lighter, and that lost mass is the energy, by E equals m c squared.'),

  ('physics', 'Thermodynamics', 'Heat transfer', 'easy', 'multiple_choice',
   null,
   'How much heat is required to raise the temperature of 200 g of water by 10 degrees Celsius? (Specific heat capacity of water is 4.2 J per g per degree)',
   '[{"id":"A","text":"840 J"},{"id":"B","text":"8400 J"},{"id":"C","text":"84000 J"},{"id":"D","text":"420 J"}]',
   'B', 'Heat equals mass times specific heat times temperature change: 200 times 4.2 times 10, which is 8400 J. Water''s unusually high specific heat is why it is used as a coolant and why coastal climates are milder than inland ones.'),

  ('physics', 'Kinematics', 'Graphs of motion', 'medium', 'multiple_choice',
   null,
   'For an object accelerating uniformly from rest, the graph of displacement against time is:',
   '[{"id":"A","text":"a horizontal line"},{"id":"B","text":"a straight line through the origin"},{"id":"C","text":"a parabola"},{"id":"D","text":"a hyperbola"}]',
   'C', 'With constant acceleration from rest, displacement is half a t squared, so it grows as the square of time and traces a parabola. A straight line would mean constant velocity, which is the case of zero acceleration -- that describes the velocity-time graph here, not the displacement one.'),

  ('physics', 'Gravitation', 'Orbital motion', 'hard', 'multiple_choice',
   null,
   'A satellite is moved into an orbit of four times its original radius around the Earth. Its orbital speed becomes:',
   '[{"id":"A","text":"unchanged"},{"id":"B","text":"twice the original"},{"id":"C","text":"one quarter of the original"},{"id":"D","text":"half the original"}]',
   'D', 'Orbital speed is the square root of GM over r, so it varies inversely with the square root of the radius, and four times the radius halves the speed. Higher orbits are slower, which is why a geostationary satellite takes a full day to circle while the space station takes about ninety minutes.'),

  ('physics', 'Magnetism', 'Force on a moving charge', 'medium', 'multiple_choice',
   null,
   'A charged particle travels parallel to a uniform magnetic field. The magnetic force acting on it is:',
   '[{"id":"A","text":"zero"},{"id":"B","text":"maximum"},{"id":"C","text":"directed along the field"},{"id":"D","text":"directed opposite to its motion"}]',
   'A', 'The magnetic force is qvB sin theta, and the angle between velocity and field is zero here, so the force vanishes. It is greatest when the particle moves perpendicular to the field. The force is also always perpendicular to the velocity, which is why a magnetic field can bend a path but never change a particle''s speed or do work on it.'),

  ('physics', 'Waves', 'Doppler effect', 'medium', 'multiple_choice',
   null,
   'A stationary observer hears the siren of an approaching ambulance. Compared with the emitted sound, the observer hears:',
   '[{"id":"A","text":"a higher frequency, with the speed of sound increased"},{"id":"B","text":"a higher frequency, with the speed of sound unchanged"},{"id":"C","text":"a lower frequency, with the speed of sound unchanged"},{"id":"D","text":"the same frequency, with only the loudness increased"}]',
   'B', 'Approaching motion compresses successive wavefronts, so they arrive more often and the pitch rises. The speed of sound is fixed by the medium -- air temperature and composition -- and does not depend on how fast the source is moving, which is the part most often got wrong.'),

  ('chemistry', 'Atomic structure', 'Quantum numbers', 'medium', 'multiple_choice',
   null,
   'What is the maximum number of electrons that can occupy a 3d subshell?',
   '[{"id":"A","text":"10"},{"id":"B","text":"6"},{"id":"C","text":"14"},{"id":"D","text":"2"}]',
   'A', 'A d subshell has five orbitals and each holds two electrons with opposed spins, giving ten. The other numbers are the capacities of p at six, f at fourteen and a single orbital at two, so knowing the orbital counts of 1, 3, 5 and 7 for s, p, d and f covers every case.'),

  ('chemistry', 'Chemical bonding', 'Intermolecular forces', 'medium', 'multiple_choice',
   null,
   'Water has a much higher boiling point than hydrogen sulfide, despite sulfur being heavier than oxygen. The main reason is:',
   '[{"id":"A","text":"the greater molar mass of water"},{"id":"B","text":"hydrogen bonding between water molecules"},{"id":"C","text":"the ionic character of the O-H bond"},{"id":"D","text":"stronger dispersion forces in water"}]',
   'B', 'Oxygen is small and strongly electronegative, so water forms hydrogen bonds, which are far stronger than the dipole and dispersion forces holding hydrogen sulfide together. Sulfur is too large and not electronegative enough to do the same. Note that water is the lighter molecule, so mass would predict the opposite of what is observed -- that anomaly is exactly what hydrogen bonding explains.'),

  ('chemistry', 'Redox reactions', 'Oxidation number', 'easy', 'multiple_choice',
   null,
   'What is the oxidation number of manganese in the permanganate ion, MnO4 with a charge of 1 minus?',
   '[{"id":"A","text":"+2"},{"id":"B","text":"+4"},{"id":"C","text":"+7"},{"id":"D","text":"-1"}]',
   'C', 'Each oxygen is taken as minus 2, so four of them contribute minus 8. For the ion to carry an overall charge of minus 1, manganese must be plus 7. This is manganese at its maximum oxidation state, which is why permanganate is such a strong oxidising agent -- it has nowhere to go but down.'),

  ('chemistry', 'Organic chemistry', 'Functional groups', 'medium', 'multiple_choice',
   null,
   'Which reagent distinguishes an aldehyde from a ketone?',
   '[{"id":"A","text":"Litmus, which the aldehyde turns red"},{"id":"B","text":"Bromine water, which decolourises with the ketone only"},{"id":"C","text":"Sodium hydroxide, which dissolves the aldehyde only"},{"id":"D","text":"Tollens'' reagent, which gives a silver mirror with the aldehyde only"}]',
   'D', 'An aldehyde has a hydrogen on its carbonyl carbon and is readily oxidised to a carboxylic acid, reducing silver ions to metallic silver and depositing the mirror. A ketone has two alkyl groups there instead and resists oxidation. Bromine water tests for unsaturation and litmus for acidity, neither of which separates these two.'),

  ('chemistry', 'States of matter', 'Gas laws', 'medium', 'multiple_choice',
   null,
   'A fixed mass of ideal gas at constant pressure is heated from 300 K to 600 K. Its volume:',
   '[{"id":"A","text":"doubles"},{"id":"B","text":"halves"},{"id":"C","text":"stays the same"},{"id":"D","text":"quadruples"}]',
   'A', 'At constant pressure, volume is proportional to absolute temperature, and 600 K is twice 300 K, so the volume doubles. The step that matters is using kelvin: doubling 27 degrees Celsius to 54 would not double the volume, because the proportionality only holds from absolute zero.'),

  ('chemistry', 'Biomolecules', 'Proteins', 'medium', 'multiple_choice',
   null,
   'The secondary structure of a protein, such as an alpha helix, is stabilised primarily by:',
   '[{"id":"A","text":"peptide bonds between adjacent amino acids"},{"id":"B","text":"hydrogen bonds between backbone amide and carbonyl groups"},{"id":"C","text":"disulfide bridges between cysteine side chains"},{"id":"D","text":"ionic bonds between charged side chains"}]',
   'B', 'Secondary structure is a pattern in the backbone, held by hydrogen bonds between the N-H of one residue and the C=O of another further along. Peptide bonds define the primary sequence rather than folding it, while disulfide bridges and ionic interactions between side chains belong to tertiary structure.'),

  ('chemistry', 'Ionic equilibrium', 'pH calculation', 'easy', 'multiple_choice',
   null,
   'What is the pH of a 0.001 M solution of hydrochloric acid at 25 degrees Celsius?',
   '[{"id":"A","text":"1"},{"id":"B","text":"11"},{"id":"C","text":"3"},{"id":"D","text":"0.001"}]',
   'C', 'Hydrochloric acid is strong and dissociates completely, so the hydrogen ion concentration is 10 to the minus 3 and the pH is 3. Answering 11 computes the pOH instead; the two must sum to 14, and an acid has to land below 7, which catches the error immediately.'),

  ('chemistry', 'Organic chemistry', 'Optical isomerism', 'hard', 'multiple_choice',
   null,
   'What is required for a carbon atom to be a stereocentre giving rise to optical isomerism?',
   '[{"id":"A","text":"Attachment to an aromatic ring"},{"id":"B","text":"A double bond to an adjacent carbon"},{"id":"C","text":"At least one hydrogen atom attached to it"},{"id":"D","text":"Four different groups attached to it"}]',
   'D', 'A carbon bonded to four different groups has a mirror image that cannot be superimposed on it, giving a pair of enantiomers. If any two of the groups are identical the molecule has an internal mirror plane and is achiral. A double bond produces cis-trans isomerism, which is geometric rather than optical.'),

  ('chemistry', 'Periodic properties', 'Atomic radius', 'medium', 'multiple_choice',
   null,
   'Which of these atoms has the largest atomic radius?',
   '[{"id":"A","text":"Potassium"},{"id":"B","text":"Sodium"},{"id":"C","text":"Lithium"},{"id":"D","text":"Hydrogen"}]',
   'A', 'All four sit in group 1, and atomic radius increases down a group as further electron shells are added. Potassium is the lowest of these and therefore the largest. Across a period the trend runs the other way, because electrons enter the same shell while the nuclear charge keeps rising.'),

  ('chemistry', 'Surface chemistry', 'Catalysis', 'medium', 'multiple_choice',
   null,
   'A catalyst increases the rate of a reaction by:',
   '[{"id":"A","text":"increasing the average kinetic energy of the reactant molecules"},{"id":"B","text":"providing an alternative pathway of lower activation energy"},{"id":"C","text":"shifting the equilibrium position towards the products"},{"id":"D","text":"raising the temperature of the reaction mixture"}]',
   'B', 'A catalyst opens a different route over a lower barrier, so a larger fraction of collisions carries enough energy to react. It does not heat the mixture or alter the energy distribution of the molecules, and it accelerates the forward and reverse reactions equally -- which is precisely why it cannot move the equilibrium position.'),

  ('biology', 'Cell structure and function', 'Organelles', 'easy', 'multiple_choice',
   null,
   'Which organelle is the site of aerobic respiration in eukaryotic cells?',
   '[{"id":"A","text":"Mitochondrion"},{"id":"B","text":"Ribosome"},{"id":"C","text":"Golgi apparatus"},{"id":"D","text":"Lysosome"}]',
   'A', 'The mitochondrion carries out the Krebs cycle and oxidative phosphorylation, producing most of the cell''s ATP. Ribosomes build proteins, the Golgi modifies and dispatches them, and lysosomes digest material -- none of which is respiration.'),

  ('biology', 'Genetics', 'Monohybrid cross', 'medium', 'multiple_choice',
   null,
   'Two heterozygous tall pea plants (Tt) are crossed, where tall is dominant to dwarf. What fraction of the offspring is expected to be dwarf?',
   '[{"id":"A","text":"1/2"},{"id":"B","text":"1/4"},{"id":"C","text":"3/4"},{"id":"D","text":"None"}]',
   'B', 'The cross gives TT, Tt, TT and tt in equal proportion. Only tt is dwarf, so one quarter. The three quarters figure is the tall phenotype, which is the answer to a different question -- and the phenotypic ratio of 3 to 1 hides a genotypic ratio of 1 to 2 to 1.'),

  ('biology', 'Human physiology', 'Circulatory system', 'medium', 'multiple_choice',
   null,
   'Which blood vessel carries oxygenated blood from the lungs to the heart?',
   '[{"id":"A","text":"Aorta"},{"id":"B","text":"Pulmonary artery"},{"id":"C","text":"Pulmonary vein"},{"id":"D","text":"Vena cava"}]',
   'C', 'The pulmonary vein is the exception to the usual rule that veins carry deoxygenated blood: it returns freshly oxygenated blood from the lungs to the left atrium. Its partner the pulmonary artery is the matching exception, carrying deoxygenated blood away from the heart. The definitions of artery and vein rest on direction of flow, not on oxygen content.'),

  ('biology', 'Plant physiology', 'Photosynthesis', 'medium', 'multiple_choice',
   null,
   'In the light-dependent reactions of photosynthesis, the oxygen released originates from:',
   '[{"id":"A","text":"ATP"},{"id":"B","text":"carbon dioxide"},{"id":"C","text":"glucose"},{"id":"D","text":"water"}]',
   'D', 'Photolysis splits water to supply electrons to photosystem II, and the oxygen is the leftover. Carbon dioxide is the intuitive guess and is wrong: its carbon and oxygen end up in carbohydrate during the Calvin cycle. Isotope labelling experiments settled this by tracing heavy oxygen supplied in water into the gas released.'),

  ('biology', 'Molecular biology', 'Central dogma', 'medium', 'multiple_choice',
   null,
   'During transcription in eukaryotes, the enzyme responsible for synthesising messenger RNA is:',
   '[{"id":"A","text":"RNA polymerase II"},{"id":"B","text":"DNA polymerase"},{"id":"C","text":"Ligase"},{"id":"D","text":"Helicase alone"}]',
   'A', 'RNA polymerase II reads the template strand and builds the mRNA transcript. DNA polymerase replicates DNA rather than transcribing it, ligase seals breaks in a backbone, and helicase only unwinds the double helix without synthesising anything.'),

  ('biology', 'Ecology', 'Energy flow', 'medium', 'multiple_choice',
   null,
   'Roughly what proportion of energy is transferred from one trophic level to the next in a typical food chain?',
   '[{"id":"A","text":"About 50 percent"},{"id":"B","text":"About 10 percent"},{"id":"C","text":"About 90 percent"},{"id":"D","text":"Nearly all of it"}]',
   'B', 'Most energy at each level is spent on respiration, movement and heat, leaving only around a tenth available to the level above. This is why food chains rarely exceed four or five links and why a given area supports far more plants than predators.'),

  ('biology', 'Human physiology', 'Excretory system', 'hard', 'multiple_choice',
   null,
   'Most reabsorption of glucose from the glomerular filtrate occurs in the:',
   '[{"id":"A","text":"distal convoluted tubule"},{"id":"B","text":"loop of Henle"},{"id":"C","text":"proximal convoluted tubule"},{"id":"D","text":"collecting duct"}]',
   'C', 'The proximal convoluted tubule reclaims essentially all filtered glucose, along with amino acids and most water and ions, using active transport. Its cells carry a dense brush border of microvilli for exactly this. The loop of Henle concentrates the filtrate, while the distal tubule and collecting duct fine-tune water and salt under hormonal control.'),

  ('biology', 'Cell division', 'Meiosis', 'hard', 'multiple_choice',
   null,
   'Crossing over during meiosis occurs in which stage, and between which structures?',
   '[{"id":"A","text":"Anaphase I, as homologues separate"},{"id":"B","text":"Prophase II, between sister chromatids of the same chromosome"},{"id":"C","text":"Metaphase I, between all four chromatids simultaneously"},{"id":"D","text":"Prophase I, between non-sister chromatids of homologous chromosomes"}]',
   'D', 'Homologues pair during prophase I and exchange segments at chiasmata, and the exchange is between non-sister chromatids -- one from each homologue. Sister chromatids are identical copies, so exchanging material between them would produce no new combinations, which is why the prophase II option describes something with no genetic consequence.'),

  ('biology', 'Evolution', 'Natural selection', 'medium', 'multiple_choice',
   null,
   'A population of bacteria survives a course of antibiotics. The best explanation is that:',
   '[{"id":"A","text":"resistant variants were already present and were the ones that reproduced"},{"id":"B","text":"the bacteria developed resistance in response to the antibiotic"},{"id":"C","text":"the antibiotic caused mutations that produced resistance"},{"id":"D","text":"individual bacteria adapted during their own lifetimes"}]',
   'A', 'Selection acts on variation that already exists: mutation is undirected, and the antibiotic removes the susceptible rather than instructing the survivors. The other options all describe an organism acquiring a trait because it needs it, which is the Lamarckian picture, and it is the single most common misconception about how resistance arises.'),

  ('biology', 'Human physiology', 'Respiratory transport', 'medium', 'multiple_choice',
   null,
   'Most carbon dioxide is carried in the blood as:',
   '[{"id":"A","text":"carbaminohaemoglobin bound within red cells"},{"id":"B","text":"bicarbonate ions in the plasma"},{"id":"C","text":"carbon dioxide gas dissolved in the plasma"},{"id":"D","text":"carbon monoxide complexes"}]',
   'B', 'About seventy percent travels as bicarbonate, formed when carbonic anhydrase inside red cells converts carbon dioxide and water into carbonic acid, which then dissociates. Roughly twenty percent binds to haemoglobin and only about ten percent remains dissolved. The same system is what ties breathing to blood pH.'),

  ('biology', 'Genetics', 'Sex-linked inheritance', 'hard', 'multiple_choice',
   null,
   'Haemophilia is X-linked recessive. A carrier mother and an unaffected father have children. What proportion of their SONS is expected to be affected?',
   '[{"id":"A","text":"All of them"},{"id":"B","text":"One quarter"},{"id":"C","text":"One half"},{"id":"D","text":"None of them"}]',
   'C', 'Sons take their single X chromosome from their mother, and half of her X chromosomes carry the allele, so half the sons are affected. Daughters also receive a normal X from their father, so none are affected although half are carriers. One quarter is the share of ALL children affected, which answers a different question than the one asked.'),

  ('biology', 'Plant physiology', 'Transport in plants', 'medium', 'multiple_choice',
   null,
   'Water rises through the xylem of a tall tree mainly because of:',
   '[{"id":"A","text":"capillary action within the vessels alone"},{"id":"B","text":"root pressure alone pushing water upward"},{"id":"C","text":"active transport carried out by xylem vessel cells"},{"id":"D","text":"transpiration pull, created by evaporation from the leaves"}]',
   'D', 'Evaporation at the leaf surface puts the water column under tension, and cohesion between water molecules transmits that pull the whole way down to the roots. Root pressure is real but far too weak to raise water tens of metres, and mature xylem vessels are dead cells with no capacity for active transport at all.'),

  ('biology', 'Microbiology', 'Viral biology', 'medium', 'multiple_choice',
   null,
   'Viruses are not classified as living organisms mainly because they:',
   '[{"id":"A","text":"cannot carry out metabolism or reproduce outside a host cell"},{"id":"B","text":"contain no genetic material of any kind"},{"id":"C","text":"are too small to be resolved by any microscope"},{"id":"D","text":"never cause disease in other organisms"}]',
   'A', 'A virus has no metabolic machinery and must take over a host cell''s ribosomes and enzymes to replicate. It does carry genetic material, either DNA or RNA, so the second option is plainly false. Electron microscopy resolves viruses perfectly well, and many are highly pathogenic.'),

  ('biology', 'Human physiology', 'Neural conduction', 'hard', 'multiple_choice',
   null,
   'During repolarisation of a neuronal action potential, the dominant ion movement is:',
   '[{"id":"A","text":"sodium moving into the cell"},{"id":"B","text":"potassium moving out of the cell"},{"id":"C","text":"calcium moving into the cell"},{"id":"D","text":"chloride moving out of the cell"}]',
   'B', 'Depolarisation is driven by sodium rushing inward; repolarisation follows once sodium channels inactivate and the slower voltage-gated potassium channels open, letting potassium leave and carrying the membrane potential back down. Those potassium channels close sluggishly, which is what overshoots into the brief hyperpolarisation after each spike.'),

  ('biology', 'Biotechnology', 'Recombinant DNA', 'medium', 'multiple_choice',
   null,
   'Restriction endonucleases are central to recombinant DNA work because they:',
   '[{"id":"A","text":"synthesise DNA from an RNA template"},{"id":"B","text":"join DNA fragments together permanently"},{"id":"C","text":"cut DNA at specific recognition sequences"},{"id":"D","text":"unwind the double helix without cutting it"}]',
   'C', 'A restriction enzyme recognises a short specific sequence and cuts there reliably, often leaving sticky ends that will pair with any fragment cut by the same enzyme. Joining those fragments is the job of ligase, and building DNA from RNA is reverse transcriptase -- three enzymes that are easy to confuse and that do quite different things.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'neet-ug'
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = 'neet-ug';


-- ======================================================================
-- FILE: 20260910_05_usmle_step1_question_bank.sql
-- ======================================================================

-- An original USMLE Step 1 question bank.
--
-- Every vignette was written for this file. Nothing reproduces, paraphrases
-- or is derived from an NBME item -- Step 1 questions are secure and
-- copyrighted, and reproducing one would expose both AceDecks and any school
-- buying Classroom. What is taken from the USMLE program is the published
-- content outline: the organ-system and process dimensions, and the fact that
-- Step 1 asks almost everything through a clinical vignette.
--
-- That last point is the design constraint. Step 1 does not ask "what does
-- this enzyme do"; it gives a patient and asks what is happening to them. A
-- bank of isolated recall items would be preparing students for an exam that
-- no longer exists -- the old two-step recall format was retired long before
-- the 2022 move to pass/fail.
--
-- Every item here turns on a mechanism a second-year medical student is
-- expected to know cold, and every distractor is a real competing diagnosis
-- or a real alternative mechanism rather than a throwaway. An implausible
-- option in a clinical vignette is worse than useless: it teaches
-- test-taking rather than differential diagnosis.
--
-- `domain` carries the organ system and `skill` the competency, matching the
-- two dimensions the content outline itself uses.
--
-- GENERATED by scripts/build-bank-sql.mjs from scripts/banks/usmleStep1.ts. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  ('step1', 'Cardiovascular System', 'Pathophysiology', 'medium', 'multiple_choice',
   'A 58-year-old man presents with crushing substernal chest pain radiating to his left arm, beginning 90 minutes ago. He is diaphoretic. ECG shows ST-segment elevation in leads II, III and aVF.',
   'Occlusion of which artery best explains these findings?',
   '[{"id":"A","text":"Right coronary artery"},{"id":"B","text":"Left anterior descending artery"},{"id":"C","text":"Left circumflex artery"},{"id":"D","text":"Left main coronary artery"}]',
   'A', 'Leads II, III and aVF look at the inferior surface of the heart, which is supplied by the right coronary artery in the roughly 85 percent of people with right-dominant circulation. The left anterior descending supplies the anterior wall and would produce changes in the precordial leads V1 to V4, while the circumflex supplies the lateral wall seen in I, aVL, V5 and V6. Recognising which leads map to which territory is the single highest-yield ECG skill on this exam.'),

  ('step1', 'Cardiovascular System', 'Pharmacology', 'medium', 'multiple_choice',
   'A 64-year-old woman with heart failure and reduced ejection fraction is started on a medication. Two weeks later her serum potassium has risen and she reports a dry cough.',
   'Which drug class most likely accounts for both findings?',
   '[{"id":"A","text":"Thiazide diuretic"},{"id":"B","text":"ACE inhibitor"},{"id":"C","text":"Beta blocker"},{"id":"D","text":"Loop diuretic"}]',
   'B', 'ACE inhibitors reduce aldosterone, which causes potassium retention, and they also block the breakdown of bradykinin, whose accumulation produces the characteristic dry cough. Both diuretic classes listed cause potassium loss rather than retention, which is the opposite of what is described. Switching to an angiotensin receptor blocker relieves the cough because it does not affect bradykinin.'),

  ('step1', 'Respiratory and Renal/Urinary Systems', 'Pathophysiology', 'medium', 'multiple_choice',
   'A 6-year-old boy develops facial swelling and frothy urine. Urinalysis shows 4+ proteinuria with no red blood cells. Serum albumin is low and cholesterol is elevated. Light microscopy of a renal biopsy is unremarkable.',
   'What is the most likely diagnosis?',
   '[{"id":"A","text":"IgA nephropathy"},{"id":"B","text":"Post-streptococcal glomerulonephritis"},{"id":"C","text":"Minimal change disease"},{"id":"D","text":"Membranous nephropathy"}]',
   'C', 'This is nephrotic syndrome -- heavy proteinuria, low albumin, oedema and hyperlipidaemia -- in a young child with a normal biopsy under light microscopy, which is the classic description of minimal change disease. The two glomerulonephritides listed are nephritic and would show haematuria rather than bland urine. Membranous nephropathy is nephrotic but is a disease of adults and shows thickened capillary walls.'),

  ('step1', 'Respiratory and Renal/Urinary Systems', 'Physiology', 'hard', 'multiple_choice',
   'A 24-year-old woman presents with anxiety and tingling in her fingers after an argument. She is breathing rapidly. Arterial blood gas shows pH 7.52, PaCO2 28 mmHg, and bicarbonate 23 mEq/L.',
   'Which acid-base disturbance is present?',
   '[{"id":"A","text":"Metabolic acidosis with respiratory compensation"},{"id":"B","text":"Acute respiratory acidosis"},{"id":"C","text":"Metabolic alkalosis with respiratory compensation"},{"id":"D","text":"Acute respiratory alkalosis"}]',
   'D', 'The pH is high, so this is an alkalosis, and the PaCO2 is low, which means the lungs are the cause rather than the compensation -- hyperventilation is blowing off carbon dioxide. A near-normal bicarbonate confirms it is acute, since renal compensation takes a day or more to appear. The tingling comes from a fall in ionised calcium as alkalosis increases its binding to albumin.'),

  ('step1', 'Reproductive and Endocrine Systems', 'Pathophysiology', 'medium', 'multiple_choice',
   'A 28-year-old woman reports weight loss despite a good appetite, heat intolerance, palpitations and anxiety. On examination she has a diffusely enlarged thyroid, a fine tremor and proptosis.',
   'Which mechanism underlies her condition?',
   '[{"id":"A","text":"Autoantibodies that stimulate the TSH receptor"},{"id":"B","text":"Autoantibodies that destroy thyroid peroxidase"},{"id":"C","text":"A pituitary adenoma secreting excess TSH"},{"id":"D","text":"Excess iodine intake causing colloid accumulation"}]',
   'A', 'Graves disease is caused by thyroid-stimulating immunoglobulins that bind and activate the TSH receptor, driving hormone production regardless of feedback. The eye findings are specific to Graves and come from the same antibodies acting on retro-orbital tissue. Anti-thyroid peroxidase antibodies belong to Hashimoto thyroiditis, which causes hypothyroidism, and a TSH-secreting adenoma is rare and would not produce proptosis.'),

  ('step1', 'Reproductive and Endocrine Systems', 'Biochemistry', 'hard', 'multiple_choice',
   'A 19-year-old with type 1 diabetes is brought in confused after missing insulin doses. He is breathing deeply and rapidly, and his breath smells fruity. Glucose is 480 mg/dL and serum ketones are markedly elevated.',
   'The deep rapid breathing is best explained as a response to which underlying disturbance?',
   '[{"id":"A","text":"Hypoglycaemia in the respiratory centre"},{"id":"B","text":"Metabolic acidosis from accumulated ketoacids"},{"id":"C","text":"Hyperosmolarity causing direct medullary stimulation"},{"id":"D","text":"Hypokalaemia impairing respiratory muscle function"}]',
   'B', 'Without insulin, unrestrained lipolysis floods the circulation with free fatty acids that the liver converts into ketoacids, producing an anion gap metabolic acidosis. Kussmaul respiration is the compensatory attempt to blow off carbon dioxide and raise pH. Total body potassium is depleted in this condition even when the measured serum level looks normal or high, because acidosis shifts potassium out of cells -- which is why replacement begins early during treatment.'),

  ('step1', 'Nervous System and Special Senses', 'Anatomy', 'hard', 'multiple_choice',
   'A 70-year-old man is found to have weakness of the right face and right arm, with the leg largely spared. He speaks in short effortful phrases but follows commands without difficulty.',
   'Which vascular territory is most likely involved?',
   '[{"id":"A","text":"Right middle cerebral artery"},{"id":"B","text":"Left anterior cerebral artery"},{"id":"C","text":"Left middle cerebral artery"},{"id":"D","text":"Basilar artery"}]',
   'C', 'The motor homunculus places face and arm on the lateral convexity supplied by the middle cerebral artery, while the leg sits medially in anterior cerebral territory -- so face and arm with a spared leg points to the MCA. Effortful speech with preserved comprehension is Broca aphasia, localising to the dominant hemisphere, which is the left in nearly all right-handed people. Right-sided weakness confirms a left-sided lesion, since the corticospinal tract decussates.'),

  ('step1', 'Nervous System and Special Senses', 'Pharmacology', 'medium', 'multiple_choice',
   'A 32-year-old woman with a history of seizures becomes pregnant. Her neurologist reviews her medication because of a known risk of neural tube defects.',
   'Supplementation with which vitamin most directly reduces this risk?',
   '[{"id":"A","text":"Vitamin K"},{"id":"B","text":"Vitamin B12"},{"id":"C","text":"Vitamin D"},{"id":"D","text":"Folate"}]',
   'D', 'Folate is required for the one-carbon transfers that build purines and thymidine, and deficiency during the first month impairs closure of the neural tube. Several anticonvulsants, valproate in particular, interfere with folate metabolism. Vitamin B12 deficiency produces a similar megaloblastic anaemia but not neural tube defects, and vitamin K matters for neonatal bleeding rather than neural development.'),

  ('step1', 'Blood and Lymphoreticular System', 'Pathophysiology', 'medium', 'multiple_choice',
   'A 22-year-old woman of Mediterranean descent has a microcytic anaemia. Serum iron, ferritin and total iron-binding capacity are all normal. Haemoglobin electrophoresis shows an elevated HbA2 fraction.',
   'What is the most likely diagnosis?',
   '[{"id":"A","text":"Beta thalassaemia minor"},{"id":"B","text":"Iron deficiency anaemia"},{"id":"C","text":"Anaemia of chronic disease"},{"id":"D","text":"Sideroblastic anaemia"}]',
   'A', 'Normal iron studies exclude iron deficiency, which is the usual cause of a microcytic anaemia, and the raised HbA2 is the diagnostic finding: reduced beta chain production leaves more delta chains to pair with alpha. The distinction matters practically -- treating this as iron deficiency leads to iron loading with no benefit, since the patient is not iron deficient at all.'),

  ('step1', 'Multisystem Processes and Disorders', 'Microbiology', 'medium', 'multiple_choice',
   'A 19-year-old college student presents with fever, severe headache and neck stiffness. Cerebrospinal fluid shows a high neutrophil count, low glucose and elevated protein. Gram stain shows gram-negative diplococci.',
   'Which organism is most likely responsible?',
   '[{"id":"A","text":"Streptococcus pneumoniae"},{"id":"B","text":"Neisseria meningitidis"},{"id":"C","text":"Haemophilus influenzae type b"},{"id":"D","text":"Listeria monocytogenes"}]',
   'B', 'Gram-negative diplococci in the cerebrospinal fluid of a young adult living in close quarters is Neisseria meningitidis. The CSF picture -- neutrophils, low glucose, high protein -- confirms a bacterial rather than viral cause, since viral meningitis shows lymphocytes and normal glucose. Pneumococcus is a gram-positive diplococcus, and Listeria is a gram-positive rod affecting neonates, the elderly and the immunosuppressed.'),

  ('step1', 'Multisystem Processes and Disorders', 'Immunology', 'hard', 'multiple_choice',
   'Minutes after a bee sting, a 30-year-old man develops widespread urticaria, wheezing and hypotension.',
   'Which hypersensitivity mechanism is responsible?',
   '[{"id":"A","text":"Type III, mediated by immune complex deposition"},{"id":"B","text":"Type II, mediated by IgG against cell surface antigens"},{"id":"C","text":"Type I, mediated by IgE bound to mast cells"},{"id":"D","text":"Type IV, mediated by sensitised T lymphocytes"}]',
   'C', 'Onset within minutes is the signature of a type I reaction: pre-formed IgE on mast cells cross-links and triggers immediate degranulation, releasing histamine, which produces the urticaria, bronchoconstriction and vasodilation. The timing alone distinguishes it -- type IV reactions such as contact dermatitis and the tuberculin test take one to three days because T cells must be recruited and activated.'),

  ('step1', 'Biostatistics, Epidemiology and Population Health', 'Biostatistics', 'hard', 'multiple_choice',
   'A screening test for a disease has a sensitivity of 95 percent and a specificity of 90 percent. It is applied to a population in which the prevalence of the disease is 1 percent.',
   'Which statement about the positive predictive value in this population is correct?',
   '[{"id":"A","text":"It is independent of prevalence"},{"id":"B","text":"It will be high, because sensitivity is high"},{"id":"C","text":"It equals the sensitivity, at 95 percent"},{"id":"D","text":"It will be low, because most positive results will be false positives"}]',
   'D', 'In 10,000 people, 100 have the disease and 95 test positive, while 9,900 do not and 10 percent of them -- 990 people -- also test positive. Only 95 of the 1,085 positives are true, so the positive predictive value is about 9 percent. Sensitivity and specificity are properties of the test and do not change with prevalence, but predictive values depend on it entirely, which is the central reason screening a low-prevalence population generates so many false alarms.'),

  ('step1', 'Gastrointestinal System', 'Pathophysiology', 'medium', 'multiple_choice',
   'A 45-year-old man has recurrent burning epigastric pain that improves after eating. Endoscopy shows a duodenal ulcer and urease testing of a biopsy specimen is positive.',
   'Which mechanism best explains the causative organism''s survival in the stomach?',
   '[{"id":"A","text":"It produces urease, generating ammonia that neutralises surrounding acid"},{"id":"B","text":"It forms endospores resistant to gastric acid"},{"id":"C","text":"It invades gastric parietal cells and shelters intracellularly"},{"id":"D","text":"It suppresses gastric acid production entirely"}]',
   'A', 'Helicobacter pylori splits urea into ammonia and carbon dioxide, creating an alkaline microenvironment that lets it live in a space almost nothing else tolerates. That same enzyme is what the diagnostic urease test detects. The organism is not an intracellular pathogen and forms no spores -- it lives in the mucus layer above the epithelium.'),

  ('step1', 'Musculoskeletal, Skin and Subcutaneous Tissue', 'Pharmacology', 'medium', 'multiple_choice',
   'A 62-year-old man with a history of gout begins a new medication for long-term prevention. He is advised it will not help an acute attack and may even precipitate one when first started.',
   'Which drug and mechanism fits this description?',
   '[{"id":"A","text":"Colchicine, which inhibits microtubule polymerisation"},{"id":"B","text":"Allopurinol, which inhibits xanthine oxidase"},{"id":"C","text":"Indomethacin, which inhibits cyclooxygenase"},{"id":"D","text":"Probenecid, which inhibits tubular reabsorption of urate"}]',
   'B', 'Allopurinol blocks xanthine oxidase and lowers urate production, which is prevention rather than treatment, and the sudden fall in serum urate can mobilise existing deposits and trigger a flare -- which is why it is started under cover of an anti-inflammatory. Colchicine and indomethacin both treat the acute attack. Probenecid is also preventive but works by increasing excretion, not by reducing synthesis.'),

  ('step1', 'Social Sciences, Ethics and Communication', 'Ethics', 'medium', 'multiple_choice',
   'A 34-year-old woman with decision-making capacity refuses a blood transfusion on religious grounds, despite being told it is likely life-saving. She is calm, understands the consequences, and is consistent in her refusal.',
   'What is the most appropriate next step?',
   '[{"id":"A","text":"Transfuse once she becomes unconscious"},{"id":"B","text":"Obtain a court order to authorise the transfusion"},{"id":"C","text":"Respect her refusal and pursue alternative management"},{"id":"D","text":"Ask her family to consent on her behalf"}]',
   'C', 'An adult with capacity may refuse any treatment, including one that is life-saving, and that right does not weaken because the decision seems unwise to the clinician. Waiting for unconsciousness to override a known wish is a particularly clear violation, since her previously expressed choice still stands. Family members cannot consent over a competent patient, and courts do not override a capacitated adult''s refusal.'),

  ('step1', 'Musculoskeletal, Skin and Subcutaneous Tissue', 'Biochemistry', 'easy', 'multiple_choice',
   'A 4-year-old child from a region with limited access to fresh produce has bleeding gums, poor wound healing and bruising. A deficiency of a vitamin required for collagen synthesis is suspected.',
   'Which vitamin is deficient?',
   '[{"id":"A","text":"Thiamine"},{"id":"B","text":"Vitamin A"},{"id":"C","text":"Vitamin K"},{"id":"D","text":"Vitamin C"}]',
   'D', 'Vitamin C is the cofactor for prolyl and lysyl hydroxylase, the enzymes that cross-link collagen. Without it collagen is weak, so vessels leak and wounds fail to close, which is scurvy. Vitamin K also causes bleeding but through clotting factor synthesis rather than collagen, and it would not impair wound healing in this way.'),

  ('step1', 'Blood and Lymphoreticular System', 'Pharmacology', 'easy', 'multiple_choice',
   'A patient on long-term warfarin requires urgent reversal before emergency surgery.',
   'Which agent directly reverses warfarin''s mechanism of action?',
   '[{"id":"A","text":"Vitamin K"},{"id":"B","text":"Protamine sulfate"},{"id":"C","text":"Naloxone"},{"id":"D","text":"Flumazenil"}]',
   'A', 'Warfarin blocks vitamin K epoxide reductase, so the liver cannot recycle vitamin K to make factors II, VII, IX and X. Supplying vitamin K restores that synthesis, though it takes hours -- which is why factor concentrate is added when bleeding is immediate. Protamine reverses heparin, naloxone opioids, and flumazenil benzodiazepines.'),

  ('step1', 'Nervous System and Special Senses', 'Physiology', 'easy', 'multiple_choice',
   'A 30-year-old woman has double vision and drooping eyelids that worsen through the day and improve after rest. Antibodies against the postsynaptic acetylcholine receptor are detected.',
   'Which process is directly impaired?',
   '[{"id":"A","text":"Conduction along the peripheral axon"},{"id":"B","text":"Neuromuscular transmission at the motor end plate"},{"id":"C","text":"Release of acetylcholine from the presynaptic terminal"},{"id":"D","text":"Calcium release from the sarcoplasmic reticulum"}]',
   'B', 'In myasthenia gravis, antibodies block and destroy postsynaptic acetylcholine receptors, so the end plate potential fades with repeated stimulation and weakness worsens with use. The transmitter is still released normally, which is what separates it from Lambert-Eaton syndrome, where antibodies attack presynaptic calcium channels and strength briefly improves with activity.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'usmle-step-1'
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = 'usmle-step-1';


-- ======================================================================
-- FILE: 20260910_06_projected_marks.sql
-- ======================================================================

-- Store the raw-marks result for exams that report one.
--
-- Every other exam in the catalog reports a scaled score, which is what
-- estimated_score_low/high hold. JEE Main and NEET report neither a scale
-- nor a band: the candidate's result is +4 per correct answer and -1 per
-- wrong one, read as "287 out of 300".
--
-- Those exams therefore leave estimated_score_low/high null, and without
-- somewhere to put the arithmetic the results screen would have shown an
-- empty dash to the two exams whose score is the easiest of all to state
-- exactly.
--
-- jsonb rather than columns because the shape belongs to
-- lib/server/diagnosticBank.ts and will change with what is worth telling a
-- student -- marks on what they attempted, the projection to a full paper,
-- and what their wrong answers cost them under negative marking. Adding a
-- column per figure would mean a migration every time that judgement moves.
--
-- Null for every exam without a marking scheme, which is all of them except
-- JEE and NEET.
--
-- Safe to run more than once.

alter table public.diagnostic_results
  add column if not exists projected_marks jsonb;

comment on column public.diagnostic_results.projected_marks is
  'Raw-marks result for exams scored arithmetically (JEE Main, NEET): marks on the questions attempted, the projection to a full paper at the same rate, and the marks lost to negative marking. Null for exams that report a scaled score, which use estimated_score_low/high instead.';


-- ======================================================================
-- FILE: 20260910_07_jee_main_hard_tier.sql
-- ======================================================================

-- The hard tier for JEE Main.
--
-- The first JEE bank was 19 percent hard and carried no stimulus at all --
-- every item a bare question with no setup. Real JEE items routinely hand
-- you a circuit, a reaction sequence, a graph or a table and make you work
-- from it, and a bank of context-free one-liners trains recall of formulas
-- rather than the thing the paper actually measures.
--
-- What "hard" means here, concretely, and what it does not:
--
-- It means multi-step. Every item below needs at least two ideas chained
-- together -- resolve, then apply conservation; identify the mechanism, then
-- predict the product; set up the integral, then evaluate at the right
-- limits. A single-step question is not made hard by using bigger numbers.
--
-- It means distractors that are the ANSWER TO THE WRONG METHOD. Each wrong
-- option below is where a specific, common error actually lands: the sign
-- flipped, the component forgotten, the factor of two dropped. A student who
-- picks one should be able to see exactly which step betrayed them.
--
-- It does NOT mean obscure. Nothing here is off-syllabus, and nothing turns
-- on remembering a constant to four figures or spotting a trick. Difficulty
-- from obscurity is fake difficulty: it lowers scores without teaching
-- anything, and it is indistinguishable to the student from a bad question.
--
-- The `hard` label stays honest for a reason beyond tidiness. lib/irt.ts
-- maps difficulty onto a beta value, and the score estimate is built on that
-- mapping -- so labelling a medium item hard does not make the bank tougher,
-- it makes the predicted score wrong in the pessimistic direction. The way
-- to raise the ceiling is to write harder questions, not to relabel easier
-- ones.
--
-- GENERATED by scripts/build-bank-sql.mjs from scripts/banks/jeeHard.ts. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  ('physics', 'Laws of motion', 'Connected bodies', 'hard', 'multiple_choice',
   'Two blocks are connected by a light inextensible string over a frictionless pulley at the edge of a table. Block A, of mass 3 kg, lies on the horizontal table top. Block B, of mass 2 kg, hangs vertically. The coefficient of kinetic friction between block A and the table is 0.2. Take g as 10 m/s squared.',
   'What is the acceleration of the system once it is released?',
   '[{"id":"A","text":"2.8 m/s squared"},{"id":"B","text":"4.0 m/s squared"},{"id":"C","text":"2.0 m/s squared"},{"id":"D","text":"6.0 m/s squared"}]',
   'A', 'The driving force is the weight of B, 20 N. Opposing it is friction on A, which is 0.2 times its normal force of 30 N, so 6 N. The net force is 14 N and the moving mass is the whole system, 5 kg, giving 2.8 m/s squared. Answering 4.0 ignores friction entirely; answering 6.0 accelerates B alone and forgets that A must be dragged along with it.'),

  ('physics', 'Work, energy and power', 'Energy with friction', 'hard', 'multiple_choice',
   'A 2 kg block is released from rest at the top of a frictionless incline of height 5 m. At the bottom it slides onto a rough horizontal surface with coefficient of kinetic friction 0.25, and comes to rest after travelling a distance d. Take g as 10 m/s squared.',
   'What is d?',
   '[{"id":"A","text":"10 m"},{"id":"B","text":"20 m"},{"id":"C","text":"5 m"},{"id":"D","text":"40 m"}]',
   'B', 'All the potential energy, mgh, becomes kinetic at the bottom, and friction then removes it over the distance d as the force times that distance. Setting mgh equal to mu m g d cancels both the mass and g, leaving d as h over mu: 5 divided by 0.25, which is 20 m. The mass cancelling is the useful insight -- a heavier block arrives faster but is also harder to stop, and slides exactly as far.'),

  ('physics', 'Current electricity', 'Circuit analysis', 'hard', 'multiple_choice',
   'A 12 V battery of negligible internal resistance is connected to a 4 ohm resistor in series with a parallel combination of a 6 ohm and a 3 ohm resistor.',
   'What current flows through the 6 ohm resistor?',
   '[{"id":"A","text":"1.33 A"},{"id":"B","text":"2.0 A"},{"id":"C","text":"0.667 A"},{"id":"D","text":"3.0 A"}]',
   'C', 'The parallel pair is 18 over 9, which is 2 ohm, so the total resistance is 6 ohm and the battery drives 2 A. That full 2 A crosses the 4 ohm resistor, dropping 8 V and leaving 4 V across the parallel section. The 6 ohm branch therefore carries 4 over 6, which is 0.667 A. Answering 2.0 C gives the total current rather than the share taken by one branch -- in parallel the branches split current in inverse proportion to their resistances.'),

  ('physics', 'Rotational motion', 'Angular momentum', 'hard', 'multiple_choice',
   'A disc of moment of inertia I spins freely at angular velocity omega. A second identical stationary disc is dropped coaxially onto it, and the two rotate together.',
   'What fraction of the original kinetic energy is lost?',
   '[{"id":"A","text":"None -- energy is conserved"},{"id":"B","text":"One quarter"},{"id":"C","text":"One third"},{"id":"D","text":"One half"}]',
   'D', 'No external torque acts, so angular momentum is conserved: I omega equals 2I omega prime, giving a final angular velocity of omega over 2. The kinetic energy, half I omega squared, starts at half I omega squared and ends at half of 2I times omega over 2 squared, which is a quarter I omega squared -- half the original. The loss goes to friction between the surfaces as they come to a common speed, which is why this is an inelastic collision in rotational form.'),

  ('physics', 'Modern physics', 'Photoelectric threshold', 'hard', 'multiple_choice',
   'A metal has a work function of 2.0 eV. Light of wavelength 400 nm falls on it. Take hc as 1240 eV nm.',
   'What is the maximum kinetic energy of the emitted photoelectrons?',
   '[{"id":"A","text":"1.1 eV"},{"id":"B","text":"3.1 eV"},{"id":"C","text":"5.1 eV"},{"id":"D","text":"0.9 eV"}]',
   'A', 'The photon energy is hc over lambda, 1240 divided by 400, which is 3.1 eV. Einstein''s equation gives the maximum kinetic energy as the photon energy minus the work function, so 3.1 minus 2.0, which is 1.1 eV. Answering 3.1 stops at the photon energy and forgets that the work function must be paid first; answering 5.1 adds the two instead of subtracting.'),

  ('chemistry', 'Chemical kinetics', 'Rate law from data', 'hard', 'multiple_choice',
   'For the reaction A + B giving products, three experiments are run at constant temperature. Doubling the concentration of A while holding B fixed doubles the initial rate. Doubling the concentration of B while holding A fixed leaves the initial rate unchanged.',
   'What is the overall order of the reaction?',
   '[{"id":"A","text":"First order"},{"id":"B","text":"Second order"},{"id":"C","text":"Zero order"},{"id":"D","text":"Third order"}]',
   'A', 'Rate is proportional to the concentration of A to the first power, since doubling A doubles the rate, and to B to the power zero, since changing B does nothing. The overall order is the sum of the exponents, 1 plus 0, so first order. A reactant that appears in the balanced equation but not in the rate law is entering after the rate-determining step, which is a real and common result rather than an oddity.'),

  ('chemistry', 'Electrochemistry', 'Cell potential and spontaneity', 'hard', 'multiple_choice',
   'A galvanic cell is assembled from a zinc electrode in zinc sulfate and a copper electrode in copper sulfate. The standard reduction potentials are minus 0.76 V for the zinc half-cell and plus 0.34 V for the copper half-cell.',
   'What is the standard cell potential?',
   '[{"id":"A","text":"-1.10 V"},{"id":"B","text":"+1.10 V"},{"id":"C","text":"+0.42 V"},{"id":"D","text":"-0.42 V"}]',
   'B', 'The more positive reduction potential is reduced, so copper is the cathode and zinc is oxidised at the anode. The cell potential is the cathode value minus the anode value: 0.34 minus minus 0.76, which is plus 1.10 V. The plus 0.42 option comes from adding the two potentials instead of subtracting, and a negative answer would mean the cell runs the other way -- which cannot be right for a spontaneous galvanic cell.'),

  ('chemistry', 'Organic chemistry', 'Reaction sequence', 'hard', 'multiple_choice',
   'Propene is treated with hydrogen bromide in the absence of peroxides. The product is then treated with alcoholic potassium hydroxide.',
   'What is the final organic product?',
   '[{"id":"A","text":"1-bromopropane"},{"id":"B","text":"Propan-2-ol"},{"id":"C","text":"Propene"},{"id":"D","text":"Propyne"}]',
   'C', 'Addition of HBr follows Markovnikov''s rule without peroxides, putting the bromine on the more substituted carbon and giving 2-bromopropane. Alcoholic potassium hydroxide then favours elimination over substitution, removing HBr and regenerating propene. The sequence returns to where it started, which is the point of the question: the reagent and solvent together decide whether you get elimination or substitution, and aqueous KOH on the same intermediate would have given propan-2-ol instead.'),

  ('chemistry', 'Equilibrium', 'Equilibrium constant', 'hard', 'multiple_choice',
   'For the reaction in which 2 moles of HI decompose into hydrogen and iodine, 1 mole of HI is placed in a 1 litre vessel and allowed to reach equilibrium. At equilibrium 0.2 moles of HI have decomposed.',
   'What is the value of the equilibrium constant Kc?',
   '[{"id":"A","text":"0.125"},{"id":"B","text":"0.25"},{"id":"C","text":"0.04"},{"id":"D","text":"0.0156"}]',
   'D', 'Decomposing 0.2 mol of HI produces 0.1 mol each of hydrogen and iodine and leaves 0.8 mol of HI. Kc is the product concentrations over the reactant concentration with the coefficients as exponents: 0.1 times 0.1 divided by 0.8 squared, which is 0.01 over 0.64, so 0.0156. Forgetting that the coefficient of 2 becomes a square in the denominator is what produces the larger values offered.'),

  ('mathematics', 'Calculus', 'Maxima and minima', 'hard', 'multiple_choice',
   'A rectangular box with a square base and no lid is to be made from 300 square centimetres of material.',
   'What base edge length maximises the volume?',
   '[{"id":"A","text":"10 cm"},{"id":"B","text":"5 cm"},{"id":"C","text":"15 cm"},{"id":"D","text":"20 cm"}]',
   'A', 'With base edge x and height h, the material is x squared plus 4xh equal to 300, so h is (300 minus x squared) over 4x. The volume is x squared h, which simplifies to 75x minus x cubed over 4. Setting the derivative 75 minus three quarters x squared to zero gives x squared equal to 100, so x is 10 cm. The step worth carrying away is eliminating h using the constraint before differentiating -- trying to differentiate two variables at once is where this question is usually lost.'),

  ('mathematics', 'Probability', 'Bayes'' theorem', 'hard', 'multiple_choice',
   'Two bags are identical in appearance. Bag one contains 3 red and 2 blue balls; bag two contains 1 red and 4 blue balls. A bag is chosen at random and one ball is drawn from it. The ball is red.',
   'What is the probability that it came from bag one?',
   '[{"id":"A","text":"1/2"},{"id":"B","text":"3/4"},{"id":"C","text":"3/5"},{"id":"D","text":"1/4"}]',
   'B', 'Each bag is equally likely, so the chance of picking bag one and drawing red is a half times three fifths, which is 0.3, while bag two gives a half times one fifth, which is 0.1. Red happens 0.4 of the time in total, and bag one accounts for 0.3 of that, so the answer is 0.3 over 0.4, which is three quarters. Answering 3/5 gives the probability of red GIVEN bag one -- the conditional the question hands you, not the reversed one it asks for, and telling those two apart is the entire point of Bayes.'),

  ('mathematics', 'Coordinate geometry', 'Circles and tangents', 'hard', 'multiple_choice',
   'A circle has equation x squared plus y squared minus 4x minus 6y plus 9 equal to zero.',
   'What is the radius of this circle?',
   '[{"id":"A","text":"4"},{"id":"B","text":"3"},{"id":"C","text":"2"},{"id":"D","text":"9"}]',
   'C', 'Complete the square in both variables: x squared minus 4x becomes (x minus 2) squared minus 4, and y squared minus 6y becomes (y minus 3) squared minus 9. Substituting gives (x minus 2) squared plus (y minus 3) squared equal to 4, so the centre is (2, 3) and the radius is the square root of 4, which is 2. Answering 4 stops at the value on the right-hand side and forgets to take the root.'),

  ('mathematics', 'Sequences and series', 'Infinite geometric series', 'hard', 'multiple_choice',
   'An infinite geometric series has first term a and common ratio r, with the absolute value of r less than 1. Its sum is 12, and the sum of the squares of its terms is 48.',
   'What is the value of the common ratio r?',
   '[{"id":"A","text":"1/4"},{"id":"B","text":"1/3"},{"id":"C","text":"2/3"},{"id":"D","text":"1/2"}]',
   'D', 'The sum gives a over (1 minus r) equal to 12. The squared terms form their own geometric series with first term a squared and ratio r squared, so a squared over (1 minus r squared) equals 48. Substituting a as 12(1 minus r) into the second equation and cancelling leaves 144(1 minus r) over (1 plus r) equal to 48, so 3(1 minus r) equals 1 plus r, giving r as one half. Recognising that the squares form their own geometric progression is the whole question.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'jee-main'
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = 'jee-main';


-- ======================================================================
-- FILE: 20260910_08_neet_ug_hard_tier.sql
-- ======================================================================

-- The hard tier for NEET UG.
--
-- The first NEET bank was 20 percent hard with no stimulus on any item. NEET
-- leans harder on recall than JEE does, but its difficult items still put
-- something in front of you -- a pedigree, a cross, a set of experimental
-- results, a patient's numbers -- and ask you to reason from it. A bank of
-- bare definitional questions trains the wrong half of the paper.
--
-- Biology carries 90 of the 180 questions and half the marks, so it carries
-- the largest share here too. Weighting it like one subject among three
-- would train an allocation of attention that loses marks.
--
-- Hard here means the same thing it means in the JEE tier: at least two
-- steps chained together, and distractors that are each the answer to a
-- specific wrong method rather than filler. It does not mean obscure. A
-- question that turns on an exception nobody teaches lowers a score without
-- teaching anything, and to the student it is indistinguishable from a
-- mistake in the bank.
--
-- GENERATED by scripts/build-bank-sql.mjs from scripts/banks/neetHard.ts. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  ('physics', 'Optics', 'Lens combinations', 'hard', 'multiple_choice',
   'A converging lens of focal length 20 cm is placed 30 cm from an object. A second converging lens of focal length 10 cm is placed 40 cm beyond the first.',
   'Where is the final image formed relative to the second lens?',
   '[{"id":"A","text":"20 cm beyond it"},{"id":"B","text":"10 cm beyond it"},{"id":"C","text":"40 cm beyond it"},{"id":"D","text":"At the second lens itself"}]',
   'A', 'For the first lens, 1/v equals 1/20 minus 1/30, giving an image 60 cm beyond it. That image lies 20 cm past the second lens, so it acts as a virtual object with u of plus 20. Applying the lens equation again gives 1/v equal to 1/10 plus 1/20, so v is 20 cm beyond the second lens. Treating the intermediate image as a real object with the sign unchanged is the standard error, and it is why the intermediate position must be located before the second lens is applied.'),

  ('physics', 'Thermodynamics', 'Efficiency', 'hard', 'multiple_choice',
   'A Carnot engine operates between a source at 500 K and a sink at 300 K, absorbing 1000 J per cycle from the source.',
   'How much work does it deliver per cycle?',
   '[{"id":"A","text":"600 J"},{"id":"B","text":"400 J"},{"id":"C","text":"1000 J"},{"id":"D","text":"200 J"}]',
   'B', 'Carnot efficiency is 1 minus the ratio of the absolute temperatures, so 1 minus 300 over 500, which is 0.4. The work is that efficiency times the heat absorbed, giving 400 J. Answering 600 J reports the heat rejected to the sink, which is the other 60 percent, and using Celsius rather than kelvin anywhere in this calculation makes the ratio meaningless.'),

  ('physics', 'Electrostatics', 'Field and potential', 'hard', 'multiple_choice',
   'Two point charges of plus 4 microcoulomb and minus 4 microcoulomb are fixed 20 cm apart.',
   'At the midpoint of the line joining them, which statement is correct?',
   '[{"id":"A","text":"Both the field and the potential are zero"},{"id":"B","text":"The electric field is zero but the potential is not"},{"id":"C","text":"The potential is zero but the electric field is not"},{"id":"D","text":"Neither the field nor the potential is zero"}]',
   'C', 'Potential is a scalar, so equal and opposite charges at equal distances contribute plus and minus values that cancel exactly. Field is a vector, and at the midpoint both charges push it the same way -- away from the positive and towards the negative -- so the two contributions add rather than cancel. This is the cleanest demonstration that zero potential does not imply zero field, and the reverse case holds between two equal positive charges.'),

  ('chemistry', 'Solutions', 'Molality and colligative properties', 'hard', 'multiple_choice',
   '18 g of glucose, molar mass 180 g/mol, is dissolved in 500 g of water. The molal freezing point depression constant for water is 1.86 K kg/mol.',
   'By how much does the freezing point fall?',
   '[{"id":"A","text":"0.372 K"},{"id":"B","text":"0.186 K"},{"id":"C","text":"3.72 K"},{"id":"D","text":"0.744 K"}]',
   'A', '18 g of glucose is 0.1 mol, dissolved in 0.5 kg of water, giving a molality of 0.2 mol/kg. The depression is Kf times molality, so 1.86 times 0.2, which is 0.372 K. Glucose does not dissociate, so the van''t Hoff factor is 1 -- had this been sodium chloride the answer would have roughly doubled, which is the comparison worth holding onto.'),

  ('chemistry', 'Organic chemistry', 'Identifying products', 'hard', 'multiple_choice',
   'An organic compound of molecular formula C3H6O gives a positive iodoform test and does not reduce Tollens'' reagent.',
   'What is the compound?',
   '[{"id":"A","text":"Propanal"},{"id":"B","text":"Propanone"},{"id":"C","text":"Propan-1-ol"},{"id":"D","text":"Propan-2-ol"}]',
   'B', 'Failing the Tollens test rules out an aldehyde, so propanal is out. A positive iodoform test requires a methyl group attached to a carbonyl, which propanone has. Propan-2-ol would also give iodoform, since it is oxidised to propanone under the test conditions, but its formula is C3H8O rather than C3H6O -- so the molecular formula settles it. Using all three pieces of evidence together is the point; any one alone leaves two candidates standing.'),

  ('chemistry', 'Atomic structure', 'Electronic configuration', 'hard', 'multiple_choice',
   'An element has the ground state electronic configuration [Ar] 3d5 4s1.',
   'Why is this configuration adopted rather than [Ar] 3d4 4s2?',
   '[{"id":"A","text":"The 4s orbital cannot hold two electrons in transition metals"},{"id":"B","text":"The 3d orbitals are always lower in energy than the 4s"},{"id":"C","text":"A half-filled d subshell gives extra stability from exchange energy"},{"id":"D","text":"It minimises the total number of unpaired electrons"}]',
   'C', 'Chromium promotes a 4s electron to give a half-filled 3d subshell, which is stabilised by exchange energy between electrons of parallel spin, plus the reduced repulsion of spreading electrons across five orbitals. The last option is the reverse of what happens: this configuration maximises unpaired electrons, at six, rather than minimising them. Copper does the same thing for a completely filled d subshell.'),

  ('biology', 'Genetics', 'Pedigree analysis', 'hard', 'multiple_choice',
   'In a family pedigree, a trait appears in every generation. Affected fathers pass it to all of their daughters but to none of their sons. Affected mothers pass it to about half of their children of either sex.',
   'What is the mode of inheritance?',
   '[{"id":"A","text":"X-linked dominant"},{"id":"B","text":"X-linked recessive"},{"id":"C","text":"Autosomal dominant"},{"id":"D","text":"Y-linked"}]',
   'A', 'An affected father passing the trait to every daughter and no son is the signature of X linkage, because he gives his X to all his daughters and his Y to all his sons. Appearing in every generation, and in heterozygous mothers passing it to half their children, marks it as dominant rather than recessive. A Y-linked trait would go father to son exclusively, which is the exact opposite of what is described.'),

  ('biology', 'Human physiology', 'Cardiac cycle', 'hard', 'multiple_choice',
   'During one phase of the cardiac cycle, both the atrioventricular valves and the semilunar valves are closed, ventricular volume is constant, and ventricular pressure is rising steeply.',
   'Which phase is being described?',
   '[{"id":"A","text":"Ventricular ejection"},{"id":"B","text":"Isovolumetric contraction"},{"id":"C","text":"Isovolumetric relaxation"},{"id":"D","text":"Atrial systole"}]',
   'B', 'All four valves closed with an unchanging volume means no blood is entering or leaving, so the pressure change identifies the phase: rising pressure is contraction, falling pressure would be relaxation. Ejection requires the semilunar valves to be open, and atrial systole requires the atrioventricular valves to be open, so both are excluded by the valve state before the pressure is even considered.'),

  ('biology', 'Plant physiology', 'Photosynthetic pathways', 'hard', 'multiple_choice',
   'Two plant species are grown side by side in hot, dry, high-light conditions. Species X shows no measurable photorespiration and has a CO2 compensation point near zero. Species Y shows substantial photorespiration.',
   'What best explains the difference in species X?',
   '[{"id":"A","text":"It lacks the Calvin cycle entirely"},{"id":"B","text":"Its RuBisCO enzyme cannot bind oxygen at all"},{"id":"C","text":"It concentrates CO2 at the site of RuBisCO by fixing carbon first in mesophyll cells"},{"id":"D","text":"It carries out photosynthesis only at night"}]',
   'C', 'A C4 plant fixes carbon initially as a four-carbon acid in mesophyll cells and releases CO2 in the bundle sheath, where RuBisCO sits. The resulting high local CO2 concentration outcompetes oxygen for the active site, so photorespiration is effectively suppressed. RuBisCO itself is unchanged and still binds oxygen given the chance -- the plant solves the problem by controlling the environment around the enzyme rather than by altering it, which is why the second option is wrong in an instructive way.'),

  ('biology', 'Molecular biology', 'Interpreting experiments', 'hard', 'multiple_choice',
   'In the Hershey and Chase experiment, bacteriophages were grown in media containing either radioactive sulfur or radioactive phosphorus, then used to infect bacteria. After blending and centrifuging, most of the phosphorus label was found in the bacterial pellet while most of the sulfur label stayed in the supernatant.',
   'What does this result establish?',
   '[{"id":"A","text":"Bacteriophages inject their entire structure into the host"},{"id":"B","text":"Protein and DNA enter the cell in equal amounts"},{"id":"C","text":"Sulfur is a component of DNA"},{"id":"D","text":"DNA, not protein, is the material that enters the cell and directs infection"}]',
   'D', 'Sulfur labels protein, since it is present in methionine and cysteine but not in nucleotides, while phosphorus labels DNA through its phosphate backbone. Phosphorus entering the cell and sulfur remaining outside shows that DNA is what is injected. The choice of two labels is the whole design: one element unique to each macromolecule is what makes the result unambiguous.'),

  ('biology', 'Ecology', 'Population growth', 'hard', 'multiple_choice',
   'A population growing in an environment with limited resources follows a curve that rises slowly at first, then steeply, then levels off as it approaches the carrying capacity K.',
   'At what population size is the growth RATE greatest?',
   '[{"id":"A","text":"At K/2"},{"id":"B","text":"At K"},{"id":"C","text":"Just above zero"},{"id":"D","text":"Just below K"}]',
   'A', 'Logistic growth has rate proportional to N times the quantity 1 minus N over K, a product that is maximised at half the carrying capacity. Near zero there are too few individuals reproducing; near K the limiting term approaches zero. This is why sustainable harvesting targets a population held near half its carrying capacity, where it replaces itself fastest.'),

  ('biology', 'Cell biology', 'Reasoning from structure', 'hard', 'multiple_choice',
   'A drug is found to bind tubulin and prevent microtubule polymerisation in dividing cells.',
   'At which stage would treated cells be expected to arrest?',
   '[{"id":"A","text":"S phase"},{"id":"B","text":"Metaphase"},{"id":"C","text":"G1 phase"},{"id":"D","text":"Telophase"}]',
   'B', 'Microtubules form the spindle that attaches to kinetochores and aligns chromosomes at the metaphase plate. Without polymerisation the spindle assembly checkpoint is never satisfied, so cells halt at metaphase. S phase and G1 both precede spindle formation and do not depend on it, and telophase lies beyond the block, which the cell can never reach.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'neet-ug'
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = 'neet-ug';
