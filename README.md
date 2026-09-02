# AceDecks

An AI study app. You give it a topic, your notes, a PDF, or a photo; it
writes the study material, quizzes you, works out what you keep forgetting,
and brings that back until you know it.

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm test         # unit tests (vitest)
npm run test:e2e # browser smoke tests (playwright)
npm run lint
```

## The shape of the app

There are four destinations, and nothing else in navigation.

| Route       | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `/home`     | One greeting, one input, one recommended action.                  |
| `/library`  | Everything you are studying. `/library/[deckId]` is the workspace. |
| `/practice` | Smart practice, a test, and reviewing mistakes.                   |
| `/vyra`     | The AI tutor, as a full chat product.                             |
| `/settings` | Account, help, and links to every less-used corner.               |

One route sits outside all of that: `/d/[slug]`, a **published study set**.
It is the only page in the signed-in half of the product written for someone
who has never heard of AceDecks — a classmate opening a link, or a search
result — so it is a *server* component with real metadata and JSON-LD, and it
is listed in `sitemap.ts` and allowed in `robots.ts`. Publishing is opt-in per
deck (`decks.is_public`), reversible, and never exposes the publisher's name,
scores or mastery. A visitor who saves the set gets their own copy
(`POST /api/library/copy`), which is what puts them into the practice loop
rather than just reading a page.

Two screens deliberately render with no chrome at all — `/study/[deckId]`
(the distraction-free session) and the older `/battle/[deckId]` (kept for
challenge links, tournaments, and open-response decks, which need its
grading flow).

Everything else lives *inside* those areas rather than getting its own tab.
Diagnostics, the mastery map, study plans, exam tracks, rank/leaderboards
and friends are linked from Practice; Quizlet/Anki/Google Docs import is
linked from Library; the rest is indexed at the bottom of Settings.

### Where the logic lives

Every one of these is a pure module with tests. They decide what a student
practises and what they are told about themselves, and getting them wrong
does not throw — it just quietly makes the app point at the wrong thing.

- `lib/mastery.ts` — **the mastery engine.** Mastery is not `correct/total`.
  Recency-weighted Bayesian strength, stability grown by spaced
  repetitions, Ebbinghaus retrievability, and a reported confidence.
  Everything downstream (what to review, what to ask next, what to warn
  about before an exam) reads from here.
- `lib/studySnapshot.ts` — the single read of "what is this student
  studying", shared by Home, Library and Practice so they cannot disagree
  and do not refetch each other's rows. Mounted once via `lib/useStudy.tsx`.
- `lib/nextAction.ts` — "what should I do next?", computed in one place.
  `sessionHref()` builds every link into a study session.
- `lib/adaptiveSession.ts` — which questions a session asks and in what
  order, from mastery plus per-question history, and how it re-aims mid
  session (three correct to step up, two misses to step down).
- `lib/mistakeRecovery.ts` — the wrong-answer loop, and the validation that
  stops a generated follow-up question from reaching a student unless its
  answer is really one of its choices.
- `lib/weakness.ts` — "your biggest opportunity", including the recurring
  sub-skills mined from recorded mistakes.
- `lib/progression.ts` — XP, levels, streaks, quests.
- `lib/ranking.ts` — Elo, rank tiers, seasons. The tier names here are the
  only rank vocabulary in the app; `/api/clashrank` shares them.
- `lib/friends.ts` — the friend graph's ordering and request rules.
- `lib/studySession.ts` — topic matching, scoring, and the end-of-session
  summary.
- `app/components/app/` — the shell (`AppFrame`), the route map (`routes.ts`),
  the universal composer, and the flashcard player.

### Two rules the server side keeps

**Nothing competitive is client-writable.** XP, ratings, quests and
achievements are all written service-role from API routes. A client that
can write its own rating is running an honour system, not a ladder.

**Every stored figure is derived from an event.** `player_progress.xp` is a
cache of `xp_events`; a rating is a cache of `rating_changes`. Awards are
keyed on (user, reason, source) so a retried request pays exactly once, and
if a cache ever disagrees with its log, the log wins.

## Plans

Everything is unlimited on every plan: no daily generation cap, no PDF cap,
no Vyra chat cap, and no beta access code. `lib/planLimits.ts` is the single
source of truth, and both the enforcement and every line of user-facing copy
read from it.

Ace Pro sells on two intervals: **$9.99 a month** or **$99 a year** (twelve
months for less than the price of ten). They are the same tier — annual is a
`BillingInterval`, not a fourth `TierId`, so entitlements, the governor and
`profiles.plan` are identical either way. Each purchasable price names the env
var holding its Stripe price id (`STRIPE_PRO_PRICE_ID`,
`STRIPE_PRO_ANNUAL_PRICE_ID`), and the savings line on the pricing page is
computed from the two amounts rather than written down, so it cannot claim a
discount the prices do not support.

Billing lives in **Settings**, not on a page of its own: plan, renewal date,
"Manage billing" (the Stripe portal), and account deletion. Stripe returns
customers to `/settings` after checkout and after the portal.

## Environment

Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `OPENAI_API_KEY`

Recommended in production:

- `CRON_SECRET` — shared secret for the **scheduled** jobs in `vercel.json`.
  Vercel Cron sends it automatically once the variable is set on the project;
  without it the scheduled runs are refused (and say so in the logs).
  The app's *own* job kicks — document upload → processing, and the pipeline
  chaining itself — do not depend on it: they authenticate with a token
  derived from `SUPABASE_SERVICE_ROLE_KEY`, which is always present. So a
  missing `CRON_SECRET` costs you the daily schedule, not document ingestion.

To actually send the mail that `email_notification_queue` collects:
`RESEND_API_KEY` and `EMAIL_FROM` (a verified sender on your Resend domain).
Without both, the drain sends nothing, discards nothing, and logs once per
run — the rows stay queued and go out on the first run after the keys are
set. The drain runs at the end of `/api/cron/srs-reviews` rather than on its
own schedule, because **Vercel's Hobby plan allows only two cron jobs** and
`vercel.json` already uses both; a third entry is a deployment error, not a
third job. `/api/cron/send-emails` exists to trigger a send by hand, and to
schedule directly if the project ever has a spare slot.

Optional: `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `UPSTASH_REDIS_*`,
`TURNSTILE_*`, and the `STRIPE_*` keys — `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` (monthly) and
`STRIPE_PRO_ANNUAL_PRICE_ID` (yearly). A missing annual price id does not fall
back to the monthly one; checkout refuses and logs, because the alternative is
charging a customer monthly for the yearly plan they picked.

`BETA_ACCESS_CODE` / `BETA_ACCESS_CODES` are no longer read by anything —
the gate they controlled was removed.

## A note on database access

Several tables are RLS-closed to the browser and can only be read or written
through an API route using the service-role client, which scopes every query
to the authenticated caller. A direct query from the browser against one of
these does not error — it silently returns nothing, or silently writes
nothing:

- `topic_review_schedule` → `GET /api/study/review-schedule`
- `decks` (writes only; reads are open) → `DELETE /api/library/material`
- `vyra_chat_sessions` / `vyra_chat_messages` → `/api/vyra/conversations`
- `player_progress` / `xp_events` / `daily_quests` / `user_achievements`
  (writes only; owner reads are open) → `GET /api/progress`, written by
  `/api/battle/finish`
- `player_ratings` / `rating_changes` (writes only) → written by
  `/api/battle/finish`; read by `/api/progress`
- `friendships` / `friend_requests` (writes only) → `/api/friends`
- `mistake_breakdowns` → `GET /api/weakness`

If a feature that depends on one of these looks like it works but does
nothing, this is the first thing to check.

## Migrations

`supabase/migrations/` is applied in filename order. Every file is written
to be safe to run more than once.
