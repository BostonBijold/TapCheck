> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Project Structure

**TapCheck** is a Next.js 14 App Router application written in TypeScript, styled with Tailwind CSS, and deployed on Vercel — Next.js API routes act as the backend (serverless functions), with MongoDB (via Mongoose) as the persistence layer. There is no separate backend service; `app/api/**/route.ts` files are the entire API surface. A native iOS shell (Capacitor, server-URL mode — see "iOS Native Shell" below) wraps this same deployed web app; it does not change or duplicate any of the above.

TapCheck is a multi-tenant, restaurant-style shift-check app — structured checklist tasks (`form`-type: numeric readings or yes/no fields) organized into task lists (Opening/Mid-Shift/Closing/manager-created custom lists) plus one or more standalone anytime task lists. Every company using TapCheck is a `Company` tenant, and a manager can create/rename/delete task lists and set their day-of-week schedule — see CLAUDE.md's Multi-Tenancy section and `docs/features/task-lists.md`. It's a lean fork of an earlier personal habit/routine tracker; the personal-habit framing (timer-based Countdown/Stopwatch/Checkbox item types as the primary type, the Sunday "Routine Review" time-variance feature) and an even earlier virtue/goals/quotes layer ("A Good Man") have both been retired, and the product vocabulary itself was later renamed from "Routine"/"Habit" to "TaskList"/"Task" throughout the codebase and docs — see `CLAUDE.md` for the current product brief and its Vocabulary note. The **native iOS App Intents/Shortcuts layer** (`ios/App/App/AppIntents/`, `ios/App/App/BeOneAPI.swift`) still uses pre-pivot "Habit"/"Be One" naming for its Swift types/target — that's a deliberate, documented exception, not an oversight; see "iOS Native Shell" below.

## Folder Map

| Folder | What lives here |
|---|---|
| `app/` | Next.js App Router: pages/layouts under `app/(app)/` and the top-level routes, plus every API route handler under `app/api/**/route.ts`. |
| `components/` | Shared React client components — page-level views (`TasksView.tsx`, `AnalyticsView.tsx`, …), bottom-sheet/modal flows (`AddTaskSheet.tsx`, `AddTaskListSheet.tsx`, `FABTodoSheet.tsx`, `EditTodoSheet.tsx`, …), the task-creation field editor (`TaskFieldsEditor.tsx`, shared by `AddTaskSheet.tsx` and `TaskListEditView.tsx`), smaller presentational pieces (`AppIcon.tsx`, `StreakDots.tsx`, `TimelineBar.tsx`, …), and `NativeBootstrap.tsx` (Keychain API-key push for App Intents, see app-intents.md). |
| `lib/` | DB connection utilities (`mongoose.ts`, `mongodb-client.ts`), auth config (`auth.ts`, `auth.config.ts`), session/company/role resolution (`session.ts` — see CLAUDE.md's Multi-Tenancy section), idempotent seed/bootstrap logic (`seed.ts`, `seed-templates.ts`), form-field validation shared by the write routes (`form-fields.ts`, see task-lists-api.md), and small shared helpers (`task-visibility.ts` — the day-of-week visibility gate, see task-lists.md — `task-progress.ts` — the weekly dot/pacing math shared by `StreakDots` and Analytics — `task-log-actions.ts`/`task-list-session-actions.ts` — the single-active-timer sweep/pause logic and `TaskListSession` bookkeeping shared by the app's own task-logs routes and the external API, see task-lists-api.md and timer.md — `task-log-events.ts` — the client-side `TASK_LOG_CHANGED_EVENT` the FAB and `TasksView`'s today list both listen for, alongside their own short-interval polling, see timer.md — `useRingDrag.ts`, `projected-finish.ts`, `task-timeline.ts` — the timer ring's drag-to-set-time gesture and the live projected-finish/timeline math, see timer.md — `week-dates.ts`, `useTodoActions.ts` — `api-key.ts` — external API key generation/lookup, see external-api.md — `task-trigger.ts` — the shared start/complete case dispatch behind the external `trigger-task` endpoint, see external-api.md — `apns.ts` — signs and sends Live Activity push updates directly to Apple's push servers, see live-activity.md — `native/` — thin Capacitor plugin bridges (`api-key-bridge.ts`, `live-activity-bridge.ts`, `routine-activity.ts` — the last two deliberately keep their "Routine"-era names to match the un-renamed iOS RoutineActivity target, see the note in `lib/native/routine-activity.ts`), see app-intents.md and live-activity.md). |
| `models/` | Mongoose schema/model definitions, one per MongoDB collection (`Company.ts`, `User.ts` — `companyId`/`role`, see CLAUDE.md — `AppIntentLink.ts` — see app-intents.md — `TaskTemplate.ts`, `TaskList.ts`, `Task.ts` (also exports the shared `FormFieldDef`/`FormFieldDefSchema` used by `TaskTemplate` too), `TaskLog.ts`, `TaskListSession.ts`, `Todo.ts`). |
| `public/` | Static assets served at the web root — app icons, the PWA `manifest.json`, and the service worker `sw.js`. |
| `scripts/` | One-off, manually-run scripts — not wired into app boot. Currently just `_tmp-check-dev-user.mjs` (scratch debug script, not part of any workflow). |
| `types/` | Shared/ambient TypeScript declarations (currently `next-auth.d.ts`, extending the NextAuth session/user types). |
| `ios/` | Generated Xcode project for the native shell (Capacitor). `ios/App/App.xcodeproj` is the project to open — this Capacitor version uses Swift Package Manager, not CocoaPods, so there is no `.xcworkspace`. `ios/App/App/MainViewController.swift` registers the App Intents Keychain bridge plugin (`capacitorDidLoad`) and disables WebView scroll bounce; `ios/App/App/AppIntents/` holds the App Intents Swift code, see app-intents.md. `ios/DerivedData/` is Xcode build cache, gitignored. |
| `assets/` | Master 1024×1024 icon and splash source images (generated from the jackalope logo via `npx capacitor-assets generate`), consumed to produce `ios/App/App/Assets.xcassets/`. |
| `capacitor.config.ts` | Capacitor config at repo root — `server.url` points the native WebView at the deployed Vercel URL (server-URL mode: no static export, the native shell just loads the live site). `server.allowNavigation` allowlists `accounts.google.com` so Google OAuth completes inside the app's own WebView instead of Capacitor bouncing it out to system Safari, which would break Auth.js's CSRF/session cookie continuity — see "iOS Native Shell" below. |

## iOS Native Shell

The iOS app is a Capacitor wrapper in **server-URL mode**: the native `WKWebView` loads the live production Next.js deployment directly (`capacitor.config.ts`'s `server.url`), the same as a browser tab, just without browser chrome and with its own icon/splash. There is no static export and no bundled frontend — the Next.js codebase requires zero changes for this to work, and any future edits to `app/`/`components/` ship to the iOS app automatically the next time production redeploys (no App Store review needed for content changes, only for native shell changes).

**Naming debt from the pre-pivot app**: the App Intents/Shortcuts Swift layer (`ios/App/App/AppIntents/TriggerHabitIntent.swift`, `HabitEntity.swift`, `HabitEntityQuery.swift`, `BeOneShortcuts.swift`, `BeOneAPI.swift`, `RoutineActivity/CompleteHabitFromActivityIntent.swift`) still uses the app's pre-pivot "habit tracker" naming and its even-older "Be One" app name (what Siri/Shortcuts shows the user today) — including the `RoutineActivity` Xcode target/Widget Extension name itself. When the rest of the codebase was renamed from "Routine"/"Habit" to "TaskList"/"Task" vocabulary, this Swift layer was deliberately left alone: a full native/Xcode-target rename is separate, higher-risk work that needs Xcode itself to verify, not something safely doable as a text-only pass — see CLAUDE.md's Vocabulary note. The URL *paths* these Swift files call (`/api/external/trigger-task`, `/api/external/tasks`, `/api/external/complete-active-task`) were updated to match the renamed API routes, since leaving those stale would have broken the native app outright — but the Swift type/file/target names themselves were not touched. Functionally these still work correctly against the current `form`-task-based data model — see app-intents.md.

**Google OAuth inside the WebView:** Capacitor's default behavior sends navigation to domains outside the app's own origin (like `accounts.google.com`) out to the system Safari app. That breaks Auth.js's sign-in flow, because the CSRF token and session cookies set when the flow starts live in the app's WebView cookie jar, not Safari's — the callback lands back in Safari's separate jar and Auth.js can't validate it, surfacing as a generic `/api/auth/error` "Server error" page. The fix was to allowlist `accounts.google.com` in `capacitor.config.ts`'s `server.allowNavigation`, keeping the whole OAuth round-trip inside the app's own WebView and its single cookie jar. This did **not** require routing through `@capacitor/browser`/`ASWebAuthenticationSession` or Universal Links — the simpler in-WebView allowlist was sufficient once tested against the real production OAuth flow in the iOS Simulator.

**Branding:** `assets/icon.png` and `assets/splash.png`/`splash-dark.png` are generated once from the jackalope logo (parchment `#e8e0cc` background for the icon so the black line art is visible; the splash screen recolors the mark to parchment against the app's dark background) and then expanded into the full `Assets.xcassets` icon/splash set via `npx capacitor-assets generate --ios`. Re-run that command after editing the `assets/` masters, then `npx cap sync ios`.

**White flash between splash and content:** `WKWebView` defaults to a white canvas until the remote page's own CSS paints — a real, visible gap in server-URL mode since content loads over the network rather than instantly from a bundle. Fixed via `capacitor.config.ts`'s `ios.backgroundColor` (Capacitor's official config for the WebView's own background, applied before any content loads) plus pinning the same color on `ios/App/App/Base.lproj/LaunchScreen.storyboard`'s root view as a second guard against letterboxing. Verified by rapid-fire screenshotting through a cold launch, not just eyeballing it once.

**Native bootstrap:** `components/NativeBootstrap.tsx` (mounted in `app/layout.tsx`, `Capacitor.isNativePlatform()`-guarded) pushes the user's API key into Keychain on every native cold start, via a custom `ApiKeyBridgePlugin` — the first custom native plugin in this project. This is what lets App Intents code (running independent of the WebView, possibly via a background launch) authenticate to the external API without ever touching React state. See app-intents.md.

### `app/` subfolders

| Path | Purpose |
|---|---|
| `app/(app)/` | The authenticated app shell — layout with the bottom nav, plus the `tasks` (including `tasks/[taskListId]/edit`), `analytics`, `profile`, and `store` (placeholder "Coming Soon" page, not linked from the bottom nav) pages. |
| `app/api/` | Every backend endpoint, grouped by domain (`task-lists`, `tasks`, `task-logs`, `task-templates`, `todos`, `analytics`, `user`, `live-activity`, `external`, `auth`, `seed`, `dev`). `external` is API-key-authenticated (no session), for outside callers like the native App Intents "Trigger Habit" action — see `docs/api/external-api.md`. |
| `app/login/` | The one public, unauthenticated page (per `middleware.ts`) — Google sign-in. Honors a `?callbackUrl=` search param as the post-sign-in redirect, falling back to `/welcome`. |
| `app/welcome/` | Post-login splash screen, shown once per sign-in before landing on `/tasks`. |

## Feature Docs

| Doc | Covers |
|---|---|
| [`features/task-lists.md`](features/task-lists.md) | Shift-based task lists (Opening/Mid-Shift/Closing/Custom), task states, back-entry, streaks, the per-task weekly schedule/success-threshold model, day-of-week visibility, manager-created/renamed/deleted task lists and list-level scheduling, and the "Start Tasks" sequential session. |
| [`features/anytime-tasks.md`](features/anytime-tasks.md) | Standalone (never-collapsing) anytime task lists, quick-log flow, the task-template catalog, and where a task's schedule/threshold gets edited. |
| [`features/timer.md`](features/timer.md) | Both timer UIs (single-task and sequential-session), how elapsed time is tracked, the drag-to-set-time ring gesture, the pause/resume-on-jump single-active-timer model, the live projected-finish-time/task-list-timeline displays, and the resume-on-reload behavior. |
| [`features/analytics.md`](features/analytics.md) | The 7-day fixed-calendar-week / 30-day rolling dashboard, `/api/analytics`'s aggregation, the schedule-aware Task Breakdown (segmented bar + pacing verdict), and the pending/today rendering in its charts. |
| [`features/todos.md`](features/todos.md) | The standalone `Todo` list — no separate API doc, folded in here — overdue carry-forward on the Tasks page and the `FABTodoSheet` creation flow. |
| [`features/app-intents.md`](features/app-intents.md) | The native "Trigger Habit" App Intent — appears in Shortcuts/Siri/Spotlight automatically, backed by a live task picker (`GET /api/external/tasks`) and a Keychain-based API key bridge (the first custom native plugin in this project). Physical NFC taps go through Shortcuts' own NFC Automation (any blank tag, no app-side setup) pointed at a Shortcut built around this action — no app-specific tag/link model. |

## API Docs

| Doc | Covers |
|---|---|
| [`api/task-lists-api.md`](api/task-lists-api.md) | Task lists (including manager-only create/rename/delete and list-level `scheduledDays` push-down), tasks (including the `scheduledDays`/`successThreshold` schedule model and `form` tasks' `formFields`), task logs (including the `paused` state, `pausedSeconds`, the FAB's `GET /api/task-logs/active`, and a form task's captured `formData`), and task list sessions — `/api/task-lists*`, `/api/tasks*`, `/api/task-logs*`. |
| [`api/task-templates-api.md`](api/task-templates-api.md) | The task-template catalog — `/api/task-templates`. |
| [`api/external-api.md`](api/external-api.md) | API-key-authenticated (no session) surface for triggering tasks/timers from outside the app — primarily the native App Intents "Trigger Habit" action, see features/app-intents.md — `/api/external/start-timer`, `/api/external/trigger-task`, `/api/external/tasks`, `/api/user/api-key`. Its request/response field names (`routineItemId`, `routineGroupId`, …) are a deliberately un-renamed wire contract — see that doc's Vocabulary note. |

Todos has no separate API doc — its small surface (`/api/todos*`) is documented inline in [`features/todos.md`](features/todos.md), the same way `/api/analytics` is folded into `features/analytics.md` rather than split out. Live Activity's push-token endpoint (`/api/live-activity/push-token`) is documented inline in [`features/live-activity.md`](features/live-activity.md) rather than split out, same reasoning.

## Secrets Policy

**This file and every file it links to must never contain secret values, API keys, or connection strings.** Reference environment variable *names* only, never their actual values:

- `MONGODB_URI`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `SKIP_AUTH` (local-dev-only auth bypass — never set in production)
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (Live Activity push, see `lib/apns.ts` and `features/live-activity.md`)

`.gitignore` excludes `.env*.local` (covers `.env.local`, `.env.development.local`, etc.), but **not** a bare `.env` or `.env.production` — if either of those is ever added, extend `.gitignore` before committing.
