-- Expands Mistake DNA categories for advanced diagnostics.
-- Backward compatible with existing values.

alter table if exists public.mistake_breakdowns
  drop constraint if exists mistake_breakdowns_confidence_rating_check;

alter table if exists public.mistake_breakdowns
  add constraint mistake_breakdowns_confidence_rating_check
  check (
    confidence_rating in (
      'careless_mistake',
      'careless_error',
      'concept_gap',
      'slow_response',
      'speed_trap',
      'misread_question',
      'guessing_pattern',
      'repeated_weakness',
      'almost_mastered'
    )
  );
