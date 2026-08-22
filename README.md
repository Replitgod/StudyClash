# AcedIQ

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

Two screens deliberately render with no chrome at all — `/study/[deckId]`
(the distraction-free session) and the older `/battle/[deckId]` (kept for
challenge links, tournaments, and open-response decks, which need its
grading flow).

Everything else lives *inside* those areas rather than getting its own tab.
Diagnostics, the mastery map, study plans, and exam tracks are linked from
Practice; Quizlet/Anki/Google Docs import is linked from Library; the rest
is indexed at the bottom of Settings.

### Where the logic lives

- `lib/studySnapshot.ts` — the single read of "what is this student
  studying", shared by Home, Library and Practice so they cannot disagree
  and do not refetch each other's rows. Mounted once via `lib/useStudy.tsx`.
- `lib/nextAction.ts` — "what should I do next?", computed in one place.
  `sessionHref()` builds every link into a study session.
- `lib/studySession.ts` — which questions a session asks, and what the
  student is told afterwards.
- `app/components/app/` — the shell (`AppFrame`), the route map (`routes.ts`),
  the universal composer, and the flashcard player.

## Plans

Everything is unlimited on every plan: no daily generation cap, no PDF cap,
no Vyra chat cap, and no beta access code. `lib/planLimits.ts` is the single
source of truth, and both the enforcement and every line of user-facing copy
read from it.

Stripe checkout and the `membership_plans` table are still wired up and
still work — nothing in the product is gated behind them.

## Environment

Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `OPENAI_API_KEY`

Optional: `NEXT_PUBLIC_SITE_URL`, the `STRIPE_*` keys, `ADMIN_EMAILS`,
`UPSTASH_REDIS_*`, `TURNSTILE_*`.

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

If a feature that depends on one of these looks like it works but does
nothing, this is the first thing to check.

## Migrations

`supabase/migrations/` is applied in filename order. Every file is written
to be safe to run more than once.
