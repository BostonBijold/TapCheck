> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Project Structure

**be-one** ("A Good Man") is a Next.js 14 App Router application written in TypeScript, styled with Tailwind CSS, and deployed on Vercel — Next.js API routes act as the backend (serverless functions), with MongoDB (via Mongoose) as the persistence layer. There is no separate backend service; `app/api/**/route.ts` files are the entire API surface.

## Folder Map

| Folder | What lives here |
|---|---|
| `app/` | Next.js App Router: pages/layouts under `app/(app)/` and the top-level routes, plus every API route handler under `app/api/**/route.ts`. |
| `components/` | Shared React client components — page-level views (`RoutinesView.tsx`, `GoalsView.tsx`, …), bottom-sheet/modal flows (`AddHabitSheet.tsx`, `FABTaskSheet.tsx`, …), and smaller presentational pieces (`HabitIcon.tsx`, `StreakDots.tsx`, …). |
| `lib/` | DB connection utilities (`mongoose.ts`, `mongodb-client.ts`), auth config (`auth.ts`, `auth.config.ts`), idempotent seed/bootstrap logic (`seed.ts`, `seed-templates.ts`, `seed-virtues.ts`), and small shared helpers (`routine-visibility.ts`, `useTodoActions.ts`, `virtue-dates.ts`). |
| `models/` | Mongoose schema/model definitions, one per MongoDB collection (`Goal.ts`, `HabitTemplate.ts`, `RoutineGroup.ts`, `RoutineItem.ts`, `RoutineLog.ts`, `Todo.ts`, `User.ts`, `Virtue.ts`, `VirtueCheckIn.ts`). |
| `public/` | Static assets served at the web root — app icons, the PWA `manifest.json`, and the service worker `sw.js`. |
| `types/` | Shared/ambient TypeScript declarations (currently `next-auth.d.ts`, extending the NextAuth session/user types). |

### `app/` subfolders

| Path | Purpose |
|---|---|
| `app/(app)/` | The authenticated app shell — layout with the bottom nav, plus the `routines`, `goals`, `analytics`, `review`, `virtues`, `profile`, `store` pages. |
| `app/api/` | Every backend endpoint, grouped by domain (`routines`, `routine-items`, `routine-logs`, `habits`, `habit-templates`, `goals`, `todos`, `virtues`, `virtue-checkins`, `analytics`, `user`, `external`, `auth`, `seed`, `dev`). `external` is API-key-authenticated (no session), for outside callers like an iPhone Shortcut — see `docs/api/external-api.md`. |
| `app/login/` | The one public, unauthenticated page (per `middleware.ts`) — Google sign-in. |
| `app/welcome/` | Post-login splash screen, shown once per sign-in before landing on `/routines`. |

## Feature Docs

| Doc | Covers |
|---|---|
| [`features/routines.md`](features/routines.md) | Time-of-day routine groups (Morning/Afternoon/Evening/Custom), item states, back-entry, streaks, and the "Start Routine" sequential session. |
| [`features/habits.md`](features/habits.md) | The standalone (never-collapsing) Habits group, quick-log flow, and the habit-template catalog. |
| [`features/timer.md`](features/timer.md) | Both timer UIs (single-habit and sequential-session), how elapsed time is tracked, and the resume-on-reload behavior. |
| [`features/analytics.md`](features/analytics.md) | The 7-day fixed-calendar-week / 30-day rolling dashboard, `/api/analytics`'s aggregation, and the pending/today rendering in its charts. |

*More feature docs (todos, goals, virtues) will be added over time following this same structure.*

## API Docs

| Doc | Covers |
|---|---|
| [`api/routines-api.md`](api/routines-api.md) | Routine groups, routine items, and routine logs — `/api/routines*`, `/api/routine-items*`, `/api/routine-logs`. |
| [`api/habits-api.md`](api/habits-api.md) | The habits list and the habit-template catalog — `/api/habits`, `/api/habit-templates`. |
| [`api/external-api.md`](api/external-api.md) | API-key-authenticated (no session) endpoint for triggering a timer from outside the app, e.g. an iPhone Shortcut — `/api/external/start-timer`, `/api/user/api-key`. |

*More API docs will be added as their corresponding feature docs are written.*

## Secrets Policy

**This file and every file it links to must never contain secret values, API keys, or connection strings.** Reference environment variable *names* only, never their actual values:

- `MONGODB_URI`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `SKIP_AUTH` (local-dev-only auth bypass — never set in production)

`.gitignore` excludes `.env*.local` (covers `.env.local`, `.env.development.local`, etc.), but **not** a bare `.env` or `.env.production` — if either of those is ever added, extend `.gitignore` before committing.
