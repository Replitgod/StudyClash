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
