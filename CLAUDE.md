# TapCheck — Project Brief for Claude Code

## Vision
A restaurant shift-check app built around one core insight: the job isn't
done until the checklist is — fridge and freezer temps, restroom checks,
cash counts, opening/closing tasks, all done consistently and left as an
honest record. TapCheck started as a lean fork of a personal habit/routine
tracker (itself a fork of an earlier, more philosophy-heavy app, "A Good
Man") — that personal-habit framing has since been retired in favor of
restaurant work checks: structured checklist tasks (`form`-type) with
numeric readings or yes/no fields, honest skip states (missed vs. rest),
streaks, and completion analytics. The old timer-based "habit" item types
(countdown/stopwatch/checkbox) and the Sunday "Routine Review" time-variance
feature are gone — a checklist's value is in what got checked, not how long
it took.

TapCheck is also multi-tenant — every restaurant, gym, or hotel using it is
a `Company`, with its own users, task lists, tasks, and check history — and
a manager can create, rename, schedule, and delete task lists directly from
the app rather than being limited to the three seeded ones. See
"Multi-Tenancy" and "Task Lists" below.

Primary user: restaurant managers and staff running shift checklists —
opening/mid-shift/closing checks plus anytime tasks (fridge, freezer,
restrooms) and any custom task lists a manager sets up. Built mobile-first
as a Vercel web app, designed to eventually become a native iOS/Android app.
The data layer must stay consistent for that future migration (MongoDB +
REST API).

---

## Vocabulary

The product vocabulary is **TaskList** for a group of checks and **Task**
for an individual item within one — full stop, applied consistently across
model/collection names, component names, variable names, internal API route
naming, code comments, and product-facing UI text and documentation. This
supersedes all earlier vocabulary from this app's pivot history: "Routine"
(→ TaskList), "RoutineItem"/"Habit item" (→ Task), "check"/"Facility Checks"
as product-concept nouns, and "habit" as this app's core concept (a
`HabitTemplate` is now a `TaskTemplate`, etc.). Plain English use of "check"
describing what a task actually does (e.g. a seeded task literally named
"Restroom Check", or a temperature "check") is unaffected — only the old
*product* vocabulary was renamed, not every occurrence of the word.

**Two deliberate, permanent exceptions**, both already reflected in code
comments at the relevant files:

1. **The external API's request/response field names** (`routineItemId`,
   `routineGroupId`, and the `GET /api/external/tasks` response's
   `itemType`/`groupId`/`groupName` keys) were **not** renamed, so an
   already-configured iPhone Shortcut doesn't need its fields edited, only
   its URL (the URL *paths* were renamed — see `docs/api/external-api.md`).
2. **The iOS native Swift layer** (`ios/App/App/AppIntents/`,
   `ios/App/App/BeOneAPI.swift`, the `RoutineActivity` Xcode target/Widget
   Extension and its `RoutineActivityAttributes` push/Live-Activity
   contract) still uses the pre-pivot "Habit"/"Routine"/"Be One" naming.
   This was a deliberate scope cut, not an oversight: a native Xcode-target
   rename needs Xcode itself to verify safely, unlike a text-only pass over
   the Next.js codebase. The URL *paths* these Swift files call were updated
   to match the renamed API routes (required — otherwise the native app
   would 404), but no Swift type/file/target name was touched. See
   `docs/project-structure.md`'s "iOS Native Shell" section.

---

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: MongoDB via Mongoose
- **Auth**: Auth.js (NextAuth v5)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (free tier)
- **Future**: React Native wrapper around same API

---

## Design System

### Colors
White-background, high-readability palette with a single brand accent
(blue) and a minimal red reserved for errors/missed — everything else is a
neutral slate/gray. Amber survives as a functional timer-warning status
color (on-track → warning → over-target), not a brand accent.
```
bg:             #ffffff   (white — all backgrounds)
card:           #f8fafc   (card surfaces)
card-hover:     #f1f5f9
text:           #0f172a   (near-black, high contrast)
muted:          #64748b
dim:            #94a3b8
olive:          #2563eb   (primary accent — actions, streaks, done states)
olive-light:    #3b82f6
gold:           #3b82f6   (special-item highlights — same accent family)
tobacco:        #78716c   (neutral — past-window states)
burgundy:       #dc2626   (missed, over-timer states)
burgundy-light: #ef4444
amber:          #d97706   (timer warning — 75% of target elapsed)
blue-muted:     #71717a   (neutral — standalone task/rest layer)
border:         #e2e8f0
border-light:   #cbd5e1
```
Token *names* (olive, gold, burgundy, etc.) are kept from the previous dark
theme for continuity with existing component code — only their hex values
changed. Don't read the names as literal colors.

### Typography
- **Headings**: Playfair Display (serif)
- **Data/Timers/Labels**: IBM Plex Mono
- **Body/UI**: Inter
- All loaded via Google Fonts

### Border Radius
- Cards: 12px
- Buttons: 8px
- Badges/pills: 20px (full round)
- Bottom sheet / modals: 16px top corners

### Layout
- Max width: 420px, centered
- Mobile-first
- Bottom navigation bar (Tasks, Analytics) around a center FAB

---

## Data Models

TapCheck is multi-tenant: every restaurant, gym, or hotel using it is a
Company, and every other collection scopes its data either to the Company
(shared configuration) or to the Company plus the specific user who acted
(activity records). See "Multi-Tenancy" below for the full reasoning.

### Company
```js
{
  _id,
  companyName,
  industry,                   // stubbed, not read anywhere yet
  timezone,                   // stubbed, not read anywhere yet
  notificationPreferences,    // stubbed, not read anywhere yet
  createdAt
}
```

### User
```js
{
  _id, email, name,
  companyId,                   // ref Company — null until a developer manually attaches one in MongoDB
  role: 'manager' | 'employee', // defaults to 'manager' on signup; hand-edited in MongoDB for now
  apiKey,                     // external-trigger auth (Shortcuts/App Intents), lazily generated
  liveActivityPushToken,      // iOS Live Activity push updates
  liveActivityPushEnvironment,// 'sandbox' | 'production'
  createdAt
}
```

### TaskList
Ownership-level — the company's shared task-list configuration, not any
individual's personal data. A manager can create, rename, schedule, and
soft-delete these directly from the app — see "Task Lists" below.
```js
{
  _id,
  companyId,
  name,             // 'Opening Shift', 'Mid-Shift', 'Closing Shift', 'Anytime Tasks', or any manager-created name
  timeOfDay: 'morning' | 'evening' | 'custom' | 'anytime',
  startTime,        // 'HH:MM' — drives the time-aware collapse window (null for 'anytime' lists, which never collapse)
  order,            // display order
  isDefault: bool,
  isActive: bool,   // soft-delete flag — same convention as Task.isActive
  scheduledDays,    // 0=Sun..6=Sat — a default pushed down onto every Task in the list when changed
}
```

### Task
Ownership-level — same reasoning as TaskList.
```js
{
  _id,
  taskListId,
  companyId,
  templateId,        // ref TaskTemplate, null for custom tasks
  name,              // 'Walk-in Fridge Temp'
  icon,              // icon key or raw emoji, e.g. '🧊'
  projectedMinutes,  // time budget for this task (also feeds the list's collapse-window math)
  order,
  isActive: bool,
  taskType: 'form' | 'standard' | 'stopwatch' | 'checkbox',
  // form = the only creatable type — a structured checklist item, see formFields below
  // standard/stopwatch/checkbox = retired personal-habit timer types, kept only for schema
  //   compatibility with pre-pivot data — nothing in the UI creates them anymore
  formFields,        // FormFieldDef[] — only populated for form: { key, label,
                     //   type: 'number'|'text'|'boolean', unit?, min?, max? }
  scheduledDays,     // 0=Sun..6=Sat — which days this task is expected; also gates whether
                     //   it actually appears on the Tasks page that day, not just analytics
  successThreshold,  // how many of this week's scheduled days = 100%
}
```

### TaskLog
Activity-level — scoped to the company for tenant isolation, with
performedByUserId recording who actually did it. Any employee on shift can
complete a given task, so uniqueness is one log per task per day for the
whole company (`companyId + taskId + date`), not per user.
```js
{
  _id,
  companyId,
  performedByUserId,
  taskId,
  date,             // YYYY-MM-DD
  actualMinutes,    // null if skipped
  state: 'in_progress' | 'paused' | 'done' | 'missed' | 'rest',
  // 'missed' = breaks streak, honest record
  // 'rest'   = intentional skip, protects streak (sick kid, late flight, rest day)
  startedAt, pausedSeconds, sessionTaskListId, // timer bookkeeping — see docs/features/timer.md
  formData,         // { [fieldKey]: string | number | boolean } — captured field values for a form task
  note,             // optional manual back-entry note
  isBackEntry: bool,
  createdAt
}
```

### Todo
Standalone quick-capture to-do, unrelated to any task list or goal concept —
see `docs/features/todos.md`. Activity-level: scoped to the company and to
the specific user who created it (still personal, no shared/assigned
concept yet).
```js
{
  _id,
  companyId,
  userId,
  name,
  scheduledDate,     // YYYY-MM-DD
  done: bool,
  completedAt,
  estimatedMinutes,
  note,
  order,
  createdAt
}
```

---

## Multi-Tenancy

Every restaurant, gym, or hotel using TapCheck is a `Company` — the tenant
anchor. Nothing in the Company model or its surrounding code is
restaurant-specific; gyms and hotels are expected customers too.

- **Ownership-level** collections (`TaskList`, `Task`, `TaskTemplate`) scope
  by `companyId` — they're the company's shared configuration, not any
  individual's data.
- **Activity-level** collections (`TaskLog`, `TaskListSession`) scope by
  `companyId` *and* stamp `performedByUserId` as an attribute, not part of
  the uniqueness key — any employee on shift might complete a given task,
  so the record is shared per task/day, not per person.
- `Todo` is scoped by both `companyId` and `userId` — still personal, but
  tenant-isolated.
- `AppIntentLink` stays scoped only to the specific user — it tracks which
  person's Shortcut is connected to a task, not company configuration.

**v1 has no self-serve company creation, invitation flow, or role-switching
UI.** A manager is manually attached to a pre-created `Company` document —
and `role` hand-edited if needed — directly in MongoDB by the developer.
`User.role` (`'manager' | 'employee'`) defaults to `'manager'` on signup.
Managers get one piece of real, in-app-built role-gated UI today: creating,
renaming, scheduling, and deleting task lists — see "Task Lists" below —
otherwise there's no broader role-switching UI yet.

`companyId`/`role` are resolved fresh from the `User` document on every
request (see `lib/session.ts`'s `resolveSessionUser()`), never cached on the
JWT — so a hand-edited company/role assignment takes effect on the very next
request instead of waiting for a new sign-in. A `null` companyId means "not
yet provisioned" and must always be treated as no access, never as its own
shared tenant — every route checks for it explicitly before scoping any
query.

`companyId` fields are plain `String`, not `ObjectId` refs — same reasoning
as the pre-existing `userId` fields they replaced: they carry whatever
string a session or API key resolves to, and `SKIP_AUTH`'s local dev company
id isn't a valid ObjectId at all.

---

## Task Lists

Beyond the three seeded shift lists (Opening/Mid-Shift/Closing) and the
auto-provisioned "Anytime Tasks" list, a manager (`User.role === "manager"`)
can:

- **Create** a new task list from the Tasks page's "+ Add Task List" button
  — name and optional start time (blank = a never-collapsing anytime list),
  then straight into the same browse-catalog-or-build-custom flow used for
  any other task list to add its tasks.
- **Rename** an existing task list, and **set its day-of-week schedule**,
  from that list's edit page (`PATCH /api/task-lists/[taskListId]`).
  Changing a list's `scheduledDays` pushes that value down onto (overwrites)
  every `Task` currently in the list — a manager turning Sunday off for the
  whole list doesn't need to edit each task by hand. This always overwrites,
  even a task customized independently before — simplest option to build,
  documented as a deliberate choice, not a bug; a task can still be
  reopened and re-customized afterward on top of the new default (a
  default-then-override relationship, not a hard lock), it just doesn't
  survive the *next* list-level schedule change.
- **Delete** a task list — a **soft delete** (`TaskList.isActive: false`),
  consistent with the existing per-task soft-delete convention, so its
  `TaskLog`/`TaskListSession` history is preserved even after it's removed
  from the active Tasks page.

Create/rename/schedule/delete are all manager-only server-side (`403` for
an employee) — see `docs/api/task-lists-api.md`.

**Day-of-week visibility**: a `Task`'s own `scheduledDays` now gates whether
it actually renders on the Tasks page for a given date (`lib/task-visibility.
ts`), not just its weekly-analytics streak dot as before. Since a list-level
schedule change pushes its `scheduledDays` down onto every task in it, a
not-scheduled list's tasks disappear for the day as a direct consequence —
no separate list-level visibility check needed. A task still shows despite
its list being off that day only if it was individually re-edited afterward
to include that day. This is a deliberate simplification: it applies to
every task uniformly, including ones with a schedule set before this feature
existed. **No missed-task notification mechanism exists in this codebase
yet** — only the Live Activity's own active-timer push, which is unrelated
— so there's nothing today to gate by this same schedule; if one is built
later, it should honor the same `scheduledDays` check.

See `docs/features/task-lists.md` for the full detail.

---

## Feature Build Order

### Phase 1 — Task Lists (built)
- [x] MongoDB connection + Mongoose models
- [x] Auth (Google OAuth via Auth.js)
- [x] Multi-tenant Company/User model, session-resolved companyId/role
- [x] Seed default shift task lists + tasks on first company load
- [x] Today view: shift task lists (Opening/Mid-Shift/Closing), time-aware collapse/expand
- [x] Task card: tap to expand actions (Start task / Missed it / Rest+Life)
- [x] Form task screen: one control per field (number reading or yes/no), actual time logged on save
- [x] TaskLog write on complete/skip, including captured `formData`
- [x] 7-day streak dots per task
- [x] Back-entry: manual log when a list's window has passed
- [x] Task List Session flow (multi-task guided walkthrough) — see docs/features/timer.md
- [x] Analytics tab — task completion, variance
- [x] Standalone To-Dos — see docs/features/todos.md
- [x] Live Activity (iOS Lock Screen timer) — see docs/features/live-activity.md
- [x] External trigger API (Shortcuts/App Intents) — see docs/api/external-api.md
- [x] Manager-created/renamed/deleted task lists + list-level day-of-week scheduling — see "Task Lists" above

Personal-habit-tracker features from before the restaurant pivot — the
timer-based Countdown/Stopwatch/Checkbox item types and the Sunday "Routine
Review" goal-vs-average-minutes comparison — have been retired. Future
phases (Goals, Virtues, Quotes) from the original "A Good Man" brief were
stripped out even earlier and are not planned here either. The recurring
"every thirty minutes" task-frequency concept is a distinct, unbuilt future
feature, not part of anything above.

---

## Task Behavior Rules

### Time-Aware Collapse
- Each TaskList has a `startTime`; the list auto-collapses once its
  projected total run time has elapsed past that start time
- Collapsed state shows: list name, dot summary, time-warning badge
- Expanding a past-window list shows a "Back-entry" banner above tasks
- Custom lists do not auto-collapse

### Skip Types
Two distinct skip states — must be visually and semantically different:

**Missed it** (`state: 'missed'`)
- User forgot, chose not to, couldn't be bothered
- Breaks streak — red dot in history
- Honest record of not doing it

**Rest / Life** (`state: 'rest'`)
- Intentional, justified skip
- Examples: rest day, sick child, late flight, vacation, injury
- Protects streak — blue dot in history
- App never punishes the user for living life

### Variance Tracking
Every TaskLog with `state: 'done'` stores `actualMinutes`, and — for a
`form` task — the captured `formData` (each field's reading or yes/no
value). Over time this builds a picture of projected vs actual time per
task, and a record of what was actually checked. Analytics shows average
actual vs projected per task, identifying where tasks consistently
over/under-run their time budget.

---

## Default Seed Data

Every seeded task is `taskType: 'form'` with its own `formFields`
(number readings or yes/no checklist entries) — see `lib/seed-templates.ts`
for each task's exact fields.

### Opening Shift
| name | icon | projectedMinutes |
|---|---|---|
| Walk-in Fridge Temp | 🧊 | 2 |
| Walk-in Freezer Temp | ❄️ | 2 |
| Handwashing Stations Stocked | 🧼 | 3 |
| Floors & Surfaces Clean | 🧹 | 5 |
| Opening Cash Count | 💵 | 5 |
| Staff Uniform & Hygiene | 👕 | 3 |
| Opening Walkthrough | 📋 | 5 |

### Mid-Shift
| name | icon | projectedMinutes |
|---|---|---|
| Line Temp Check | 🌡️ | 3 |
| Restock Check | 📦 | 5 |
| Restroom Check | 🚻 | 3 |
| Trash & Recycling | 🗑️ | 5 |

### Closing Shift
| name | icon | projectedMinutes |
|---|---|---|
| Walk-in Fridge Temp (Close) | 🧊 | 2 |
| Walk-in Freezer Temp (Close) | ❄️ | 2 |
| Equipment Powered Down | 🔌 | 5 |
| Deep Clean Kitchen | 🧽 | 15 |
| Closing Cash Reconciliation | 💵 | 10 |
| Trash Taken Out | 🗑️ | 5 |
| Doors Locked / Alarm Set | 🔒 | 3 |

### Anytime Tasks (standalone, never collapses)
| name | icon | projectedMinutes |
|---|---|---|
| Fridge | 🧊 | 2 |
| Freezer | ❄️ | 2 |
| Men's Room | 🚹 | 3 |
| Women's Room | 🚺 | 3 |

See `lib/seed.ts` / `lib/seed-templates.ts` for the source of truth — this
table is a quick reference, not authoritative.

---

## Current App State
- Task Lists: BUILT — Opening/Mid-Shift/Closing shift lists + standalone Anytime Tasks list + manager-created custom lists, time-aware collapse/expand, dot progress, Edit button per list
- Task List Session: BUILT — guided multi-task walkthrough with live projected-finish/timeline
- Analytics tab: BUILT — task completion, variance data
- To-Dos: BUILT — standalone quick-capture list, shown on the Today view
- Live Activity: BUILT — iOS Lock Screen timer (see `docs/features/live-activity.md`)
- External API: BUILT — Shortcuts/App Intents trigger endpoint (see `docs/api/external-api.md`)
- Manager task-list management: BUILT — create/rename/schedule/delete, see "Task Lists" above
- FAB button (center bottom nav): resumes the active timer when one exists; otherwise inert

Routine Review (the old Sunday goal-vs-average-minutes comparison) has been
retired — it doesn't fit a checklist-based work app.

**Bottom nav:**
1. Tasks (left) — Today view
2. FAB (center) — active-timer resume indicator only
3. Analytics (right) — task trends, variance, adherence

**Top nav:**
- Left: Jackalope logo mark
- Center: app name + date
- Right: Profile avatar (Google icon or initial — opens profile/settings)

---

## UI Reference

### Today View Structure (top to bottom)
1. Top nav: Jackalope left, app name / date center, profile avatar right
2. Date navigator: < Today >
3. Progress counter + progress bar
4. Opening Shift list (collapsible, time-aware)
5. To-dos for the day
6. Mid-Shift list (collapsible, time-aware)
7. Closing Shift list (collapsible, time-aware)
8. "+ Add Task List" button (managers only)
9. Standalone Anytime Tasks list(s)
10. Bottom nav: Tasks / Analytics

### Task List — Time-Aware Collapse Logic
```
Before startTime                        → collapsed (not yet)
Between startTime and start+projected    → expanded (active window)
Shortly after that window                → expanded with "back-entry" banner (manual logging)
After that                               → collapsed (window passed, dots show summary)
```
User can customize `startTime` per list via the list's Edit screen; a
manager can also set the list's `scheduledDays` there (see "Task Lists"
above).

### Timer Screen
- Full screen takeover
- Ring countdown (SVG circle, stroke animates)
- Color states: olive (on track) → amber (75% elapsed) → burgundy (over target)
- Over-target shows +MM:SS in burgundy
- Pause / Resume / Log buttons

### Task Card States
- **open**: pending, dark card, "Pending" badge, tap expands to actions
- **done**: olive border, "Done" badge, variance shown (+/-Xm)
- **missed**: burgundy border, "Missed" badge
- **rest**: blue-muted border, "Rest" badge

---

## Environment Variables Needed
```
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=      # if using Google OAuth
GOOGLE_CLIENT_SECRET=  # if using Google OAuth
APNS_KEY_ID=           # Apple Push Notifications Auth Key — see docs/features/live-activity.md
APNS_TEAM_ID=          # X3DPK5Y29G
APNS_PRIVATE_KEY=      # contents of the downloaded .p8 file
```

---

## Notes for Claude Code
- Write to the top-level `app/`, `components/`, `lib/`, `models/` directories (no `/src` wrapper)
- Use server components where possible, client components only where interactivity needed
- API routes under `app/api/`
- Keep Mongoose models in `models/`
- DB connection utility in `lib/mongoose.ts`
- Do not use localStorage or sessionStorage — all state lives in MongoDB
- The app should feel native on mobile Safari — test tap targets at 44px minimum
- Seed script should be idempotent (safe to run multiple times)
- Follow the Vocabulary section above for any new code, comments, or UI text —
  "TaskList"/"Task", never "Routine"/"Habit"/"check" as product-concept nouns,
  except the two documented exceptions (external API wire contract, iOS Swift layer)
