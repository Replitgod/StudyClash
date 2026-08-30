-- AcedIQ -> AceDecks, for rows already written.
--
-- The product was renamed twice: StudyClash -> AcedIQ (handled by
-- 20260801_acediq_rebrand_data.sql) and then AcedIQ -> AceDecks, which never
-- got its matching data migration. The seed text in the old migrations has
-- been corrected so a FRESH database is right from day one, but that does not
-- touch rows those migrations already inserted -- same reasoning and same
-- pattern as 20260801.
--
-- This is user-visible, not cosmetic: exam_definitions.disclaimer renders
-- verbatim at the bottom of /diagnostics, so the app was showing students a
-- legal disclaimer naming a product that no longer exists ("This is an
-- unofficial AcedIQ diagnostic and is not affiliated with or endorsed by
-- College Board...").
--
-- Safe to run repeatedly: each UPDATE is a plain string replace, so a second
-- run is a no-op once the text no longer contains "AcedIQ".

update public.exam_definitions
set disclaimer = replace(disclaimer, 'AcedIQ', 'AceDecks')
where disclaimer like '%AcedIQ%';

update public.membership_plans
set label = replace(label, 'AcedIQ', 'AceDecks')
where label like '%AcedIQ%';

update public.membership_plans
set description = replace(description, 'AcedIQ', 'AceDecks')
where description like '%AcedIQ%';
