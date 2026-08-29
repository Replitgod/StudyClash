-- SM-2 state on the per-question review schedule.
--
-- The schedule previously used a correct-streak plus a fixed interval
-- ladder (lib/srsSchedule.ts). That is a reasonable approximation, but the
-- brief specifies SuperMemo-2 and the difference is real: SM-2 carries a
-- per-card ease factor, so a card a student keeps failing gets *harder* to
-- graduate rather than resetting to the same ladder every time.
--
-- Defaults match INITIAL_SM2 in lib/sm2.ts. Existing rows adopt them, which
-- means an established card restarts its ease at the 2.50 baseline rather
-- than inheriting one it never had -- the honest option, since the ease of
-- a card reviewed under the old scheme was never recorded.
--
-- Safe to run multiple times.

alter table public.question_review_schedule
  add column if not exists ease_factor numeric(4, 2) not null default 2.50;

alter table public.question_review_schedule
  add column if not exists interval_days integer not null default 0;

alter table public.question_review_schedule
  add column if not exists repetitions integer not null default 0;

comment on column public.question_review_schedule.ease_factor is
  'SM-2 ease factor. Clamped to 1.30-3.00 by lib/sm2.ts; 2.50 is the baseline for a new card.';

comment on column public.question_review_schedule.interval_days is
  'Days until this card is next due. Feeds visual_decay_alpha on the knowledge map.';

comment on column public.question_review_schedule.repetitions is
  'Consecutive successful reviews. Resets to 0 on a lapse, which is what stops a struggling student being escalated to open-response questions.';
