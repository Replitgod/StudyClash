-- The exam_definitions.disclaimer seeded in 20260715_diagnostics_and_study_plans.sql
-- only covers trademark/affiliation ("not affiliated with College Board...").
-- It doesn't set expectations that diagnostics are an experimental, in-beta
-- feature (question bank still small, scoring not yet validated against real
-- exams) -- students could read "unofficial" and still assume the scoring is
-- production-grade. Prepending an explicit beta framing, via UPDATE rather
-- than editing the original seed migration, since that migration has likely
-- already run in production and edits to applied migrations don't re-apply.
update public.exam_definitions
set disclaimer = 'Experimental exam practice -- currently in beta. ' || disclaimer
where disclaimer not like 'Experimental exam practice%';
