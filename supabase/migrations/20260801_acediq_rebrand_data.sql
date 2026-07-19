-- Part of the StudyClash -> AcedIQ rebrand. Editing the source text in old
-- seed migrations (20260715_diagnostics_and_study_plans.sql,
-- 20260719_membership_plans_backfill.sql) fixes what a FRESH database gets
-- from day one, but doesn't touch rows already inserted by those migrations
-- on this environment -- this is the matching UPDATE for already-persisted
-- data, same pattern as 20260717_exam_disclaimer_beta_framing.sql.
--
-- Safe to run multiple times (each UPDATE is a plain string replace, so a
-- second run is a no-op once the text no longer contains "StudyClash").

update public.membership_plans
set label = replace(label, 'StudyClash', 'AcedIQ')
where label like '%StudyClash%';

update public.membership_plans
set description = replace(description, 'StudyClash', 'AcedIQ')
where description like '%StudyClash%';

update public.exam_definitions
set disclaimer = replace(disclaimer, 'StudyClash', 'AcedIQ')
where disclaimer like '%StudyClash%';
