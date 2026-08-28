# TapCheck — Project Brief for Claude Code

## Vision
A restaurant shift-check app built around one core insight: the job isn't
done until the checklist is — fridge and freezer temps, restroom checks,
cash counts, opening/closing tasks, all done consistently and left as an
honest record. TapCheck started as a lean fork of a personal habit/routine
tracker (itself a fork of an earlier, more philosophy-heavy app, "A Good
Man") — that personal-habit framing has since been retired in favor of
restaurant work checks: structured checklist items (`form_check`) with
numeric readings or yes/no fields, honest skip states (missed vs. rest),
streaks, and completion analytics. The old timer-based "habit" item types
(countdown/stopwatch/checkbox) and the Sunday "Routine Review" time-variance
feature are gone — a checklist's value is in what got checked, not how long
it took.

Primary user: restaurant managers and staff running shift checklists —
opening/mid-shift/closing checks plus anytime facility checks (fridge,
freezer, restrooms). Built mobile-first as a Vercel web app, designed to
eventually become a native iOS/Android app. The data layer must stay
consistent for that future migration (MongoDB + REST API).

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
- Bottom navigation bar (Checks, Analytics) around a center FAB

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

### RoutineGroup
Ownership-level — the company's shared shift-group configuration, not any
individual's personal data.
```js
{
  _id,
  companyId,
  name,             // 'Opening Shift', 'Mid-Shift', 'Closing Shift', 'Facility Checks', etc.
  timeOfDay: 'morning' | 'evening' | 'custom' | 'habit',
  startTime,        // 'HH:MM' — drives the time-aware collapse window (null for 'habit' groups, which never collapse)
  order,            // display order
  isDefault: bool
}
```

### RoutineItem
Ownership-level — same reasoning as RoutineGroup.
```js
{
  _id,
  groupId,
  companyId,
  templateId,        // ref HabitTemplate, null for custom items
  name,              // 'Walk-in Fridge Temp'
  icon,              // icon key or raw emoji, e.g. '🧊'
  projectedMinutes,  // time budget for this check (also feeds the group's collapse-window math)
  order,
  isActive: bool,
  itemType: 'form_check' | 'standard' | 'stopwatch' | 'checkbox',
  // form_check = the only creatable type — a structured checklist item, see formFields below
  // standard/stopwatch/checkbox = retired personal-habit timer types, kept only for schema
  //   compatibility with pre-pivot data — nothing in the UI creates them anymore
  formFields,        // FormFieldDef[] — only populated for form_check: { key, label,
                     //   type: 'number'|'text'|'boolean', unit?, min?, max? }
  scheduledDays,     // 0=Sun..6=Sat — which days this item is expected
  successThreshold,  // how many of this week's scheduled days = 100%
}
```

### RoutineLog
Activity-level — scoped to the company for tenant isolation, with
performedByUserId recording who actually did it. Any employee on shift can
complete a given check, so uniqueness is one log per item per day for the
whole company (`companyId + routineItemId + date`), not per user.
```js
{
  _id,
  companyId,
  performedByUserId,
  routineItemId,
  date,             // YYYY-MM-DD
  actualMinutes,    // null if skipped
  state: 'in_progress' | 'paused' | 'done' | 'missed' | 'rest',
  // 'missed' = breaks streak, honest record
  // 'rest'   = intentional skip, protects streak (sick kid, late flight, rest day)
  startedAt, pausedSeconds, sessionGroupId, // timer bookkeeping — see docs/features/timer.md
  formData,         // { [fieldKey]: string | number | boolean } — captured field values for a form_check item
  note,             // optional manual back-entry note
  isBackEntry: bool,
  createdAt
}
```

### Todo
Standalone quick-capture to-do, unrelated to any routine or goal concept —
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

- **Ownership-level** collections (`RoutineGroup`, `RoutineItem`,
  `HabitTemplate`) scope by `companyId` — they're the company's shared
  configuration, not any individual's data.
- **Activity-level** collections (`RoutineLog`, `RoutineSession`) scope by
  `companyId` *and* stamp `performedByUserId` as an attribute, not part of
  the uniqueness key — any employee on shift might complete a given check,
  so the record is shared per item/day, not per person.
- `Todo` is scoped by both `companyId` and `userId` — still personal, but
  tenant-isolated.
- `AppIntentLink` stays scoped only to the specific user — it tracks which
  person's Shortcut is connected to a habit, not company configuration.

**v1 has no self-serve company creation, invitation flow, or role-switching
UI.** A manager is manually attached to a pre-created `Company` document —
and `role` hand-edited if needed — directly in MongoDB by the developer.
`User.role` (`'manager' | 'employee'`) defaults to `'manager'` on signup but
has no UI built around it yet.

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

## Feature Build Order

### Phase 1 — Routines (built)
- [x] MongoDB connection + Mongoose models
- [x] Auth (Google OAuth via Auth.js)
- [x] Seed default shift groups + check items on first login
- [x] Today view: shift groups (Opening/Mid-Shift/Closing), time-aware collapse/expand
- [x] Check card: tap to expand actions (Start check / Missed it / Rest+Life)
- [x] Form Check screen: one control per field (number reading or yes/no), actual time logged on save
- [x] RoutineLog write on complete/skip, including captured `formData`
- [x] 7-day streak dots per item
- [x] Back-entry: manual log when a group's window has passed
- [x] Routine Session flow (multi-item guided walkthrough) — see docs/features/timer.md
- [x] Analytics tab — check completion, variance
- [x] Standalone To-Dos — see docs/features/todos.md
- [x] Live Activity (iOS Lock Screen timer) — see docs/features/live-activity.md
- [x] External trigger API (Shortcuts/App Intents) — see docs/api/external-api.md

Personal-habit-tracker features from before the restaurant pivot — the
timer-based Countdown/Stopwatch/Checkbox item types and the Sunday "Routine
Review" goal-vs-average-minutes comparison — have been retired. Future
phases (Goals, Virtues, Quotes) from the original "A Good Man" brief were
stripped out even earlier and are not planned here either.

---

## Routine Behavior Rules

### Time-Aware Collapse
- Each RoutineGroup has a `startTime`; the group auto-collapses once its
  projected total run time has elapsed past that start time
- Collapsed state shows: group name, dot summary, time-warning badge
- Expanding a past-window group shows a "Back-entry" banner above items
- Custom groups do not auto-collapse

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
Every RoutineLog with `state: 'done'` stores `actualMinutes`, and — for a
`form_check` item — the captured `formData` (each field's reading or yes/no
value). Over time this builds a picture of projected vs actual time per
item, and a record of what was actually checked. Analytics shows average
actual vs projected per item, identifying where checks consistently
over/under-run their time budget.

---

## Default Seed Data

Every seeded item is `itemType: 'form_check'` with its own `formFields`
(number readings or yes/no checklist entries) — see `lib/seed-templates.ts`
for each item's exact fields.

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

### Facility Checks (standalone, never collapses)
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
- Routines: BUILT — Opening/Mid-Shift/Closing shift groups + standalone Facility Checks group, time-aware collapse/expand, dot progress, Edit button per group
- Routine Session: BUILT — guided multi-item walkthrough with live projected-finish/timeline
- Analytics tab: BUILT — check completion, variance data
- To-Dos: BUILT — standalone quick-capture list, shown on the Today view
- Live Activity: BUILT — iOS Lock Screen timer (see `docs/features/live-activity.md`)
- External API: BUILT — Shortcuts/App Intents trigger endpoint (see `docs/api/external-api.md`)
- FAB button (center bottom nav): resumes the active timer when one exists; otherwise inert

Routine Review (the old Sunday goal-vs-average-minutes comparison) has been
retired — it doesn't fit a checklist-based work app.

**Bottom nav:**
1. Checks (left) — Today view
2. FAB (center) — active-timer resume indicator only
3. Analytics (right) — check trends, variance, adherence

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
4. Opening Shift group (collapsible, time-aware)
5. To-dos for the day
6. Mid-Shift group (collapsible, time-aware)
7. Closing Shift group (collapsible, time-aware)
8. Standalone Facility Checks group(s)
9. Bottom nav: Checks / Analytics

### Routine Group — Time-Aware Collapse Logic
```
Before startTime                        → collapsed (not yet)
Between startTime and start+projected    → expanded (active window)
Shortly after that window                → expanded with "back-entry" banner (manual logging)
After that                               → collapsed (window passed, dots show summary)
```
User can customize `startTime` per group via the group's Edit screen.

### Timer Screen
- Full screen takeover
- Ring countdown (SVG circle, stroke animates)
- Color states: olive (on track) → amber (75% elapsed) → burgundy (over target)
- Over-target shows +MM:SS in burgundy
- Pause / Resume / Log buttons

### Routine Card States
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
