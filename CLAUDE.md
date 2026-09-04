# Ch'rps — Project Brief for Claude Code

## Vision
A restaurant shift-check app built around one core insight: the job isn't
done until the checklist is — fridge and freezer temps, restroom checks,
cash counts, opening/closing tasks, all done consistently and left as an
honest record. Ch'rps started as a lean fork of a personal habit/routine
tracker (itself a fork of an earlier, more philosophy-heavy app, "A Good
Man") — that personal-habit framing has since been retired in favor of
restaurant work checks: structured checklist tasks (`form`-type) with
numeric readings or yes/no fields, honest skip states (missed vs. rest),
streaks, and completion analytics. The old timer-based "habit" item types
(countdown/stopwatch/checkbox) and the Sunday "Routine Review" time-variance
feature are gone — a checklist's value is in what got checked, not how long
it took.

Ch'rps is also multi-tenant — every restaurant, gym, or hotel using it is
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

**One deliberate, permanent exception remains** (a second one, the external
API's un-renamed wire-contract field names, no longer applies — that whole
surface was deleted, see `docs/project-structure.md`'s "iOS Native Shell"
section):

**The `RoutineActivity` Xcode target/Widget Extension's `Habit`/`Routine`
naming** (`RoutineActivityAttributes`, its `ContentState` push/Live-Activity
contract) still uses the pre-pivot vocabulary. This was a deliberate scope
cut, not an oversight: a native Xcode-target rename needs Xcode itself to
verify safely, unlike a text-only pass over the Next.js codebase. See
`docs/project-structure.md`'s "iOS Native Shell" section. The app's own
brand-name naming in this same layer (`ios/App/App/ChrpsAPI.swift`,
`ChrpsShortcuts.swift`, previously `BeOneAPI.swift`/`BeOneShortcuts.swift`
from the "Be One" app this was originally forked from, then briefly
"TapCheck") is moot now too — both files were deleted along with the App
Intents/Shortcuts layer they backed, not just renamed.

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
(blue), a green reserved for confirmed-complete indicators, and a minimal
red for errors/missed — everything else is a neutral slate/gray. Amber
survives as a functional timer-warning status color (on-track → warning →
over-target), not a brand accent.
```
bg:             #ffffff   (white — all backgrounds)
card:           #f8fafc   (card surfaces)
card-hover:     #f1f5f9
text:           #0f172a   (near-black, high contrast)
muted:          #64748b
dim:            #94a3b8
olive:          #2563eb   (primary accent — actions, buttons, links, streaks)
olive-light:    #3b82f6
done:           #22b37c   (Ch'rps Green — sampled from the logo's own
                           checkmark; completion badges/borders/dots ONLY —
                           e.g. a task card's "✓ Done" pill, StreakDots'
                           done dot — kept distinct from olive so "this is
                           actually finished" reads apart from ordinary blue
                           actions/buttons, especially now that blue also
                           covers TaskFormScreen/TaskListSessionView's
                           task-swap transition backdrop)
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
changed. Don't read the names as literal colors. `done` is the one
exception: a genuinely new token (not inherited from the old theme), added
specifically to separate completion indicators from the broader blue accent.

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
- Bottom navigation bar (Tasks, Team, Reports, Inventory) around a center
  FAB — see "Current App State" below for the exact tab layout

---

## Data Models

Ch'rps is multi-tenant: every restaurant, gym, or hotel using it is a
Company, and every other collection scopes its data either to the Company
(shared configuration) or to the Company plus the specific user who acted
(activity records). See "Multi-Tenancy" below for the full reasoning.

### Company
```js
{
  _id,
  companyName,
  industry,                   // stubbed, not read anywhere yet
  timezone,                   // IANA zone name ('America/Chicago') or null — no longer stubbed as of
                               // the missed-shift-list alert sweep (see "Notifications" below), which
                               // needs a company-local "now" independent of any browser's own offset.
                               // Manager-set from Profile > Company Settings; null skips that company
                               // in the sweep entirely (see docs/features/notifications.md).
  notificationPreferences,    // stubbed, not read anywhere yet
  notificationSound,          // 'standard' | 'male' — defaults 'standard'; which chirp plays on a
                               // device that completes an NFC-bound task via "Scan NFC to Save"
                               // (docs/features/nfc.md). Manager-set from Profile > Company Settings.
  notificationsEnabled,        // bool, defaults true — company-wide kill switch for missed-shift-list
                               // push alerts (see "Notifications" below). No per-manager mute in v1.
  subscription: {              // stubbed — no Stripe integration wired up yet
    status,                   // 'trialing' | 'active' | 'past_due' | 'canceled' | 'none' — defaults 'trialing'
    tier,                     // 'free' | 'starter' | 'pro' — defaults 'free'
    stripeCustomerId,         // "cus_..." — set once they exist in Stripe, even pre-payment
    stripeSubscriptionId,     // "sub_..." — set once they actually subscribe
    trialEndsAt,              // Date, if timed trials are used
    seatLimit,                // for later per-seat pricing
    currentPeriodEnd,         // Date — shows "renews on X" without hitting the Stripe API
  },
  createdAt
}
```

### User
```js
{
  _id, email, name,
  companyId,                   // ref Company — null until attached via an Invite redemption or (still supported)
                               // a developer manually attaching one in MongoDB
  role: 'manager' | 'employee' | null, // defaults to 'manager' on signup; null after DELETE /api/team/[userId]
                               // detaches a user from their company (see "Team & Invites" below) — a null role
                               // never grants access on its own, every route gates on companyId first
  companyJoinedAt,             // Date | null — set at Invite redemption alongside companyId/role; null for
                               // anyone attached by hand in MongoDB. Distinct from account-creation createdAt
                               // so re-joining a *different* company later reflects current tenure there.
  liveActivityPushToken,      // iOS Live Activity push updates
  liveActivityPushEnvironment,// 'sandbox' | 'production'
  createdAt
}
```

### Invite
Ownership-level, company-scoped join token — see "Team & Invites" below and
`docs/features/team-invites.md`.
```js
{
  _id,
  companyId,
  token,             // crypto.randomBytes(24).toString("base64url") — unguessable, opening
                     //   /invite/<token> is what attaches a user to companyId
  role: 'employee' | 'manager', // preset by the manager who generated it; applied to the User on redemption
  createdByUserId,   // attribution only, same convention as NfcTag.claimedByUserId
  expiresAt,         // Date — default now + 7 days
  maxUses,           // default 1; a "reusable link" invite sets a higher cap
  useCount,          // incremented atomically on each redemption
  revokedAt,         // Date | null — soft-delete, set by a manager revoking a pending invite
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
  order,            // same-`startTime` tie-breaker only — lists display sorted by
                    // `startTime` (anytime lists, `startTime: null`, sort separately),
                    // not by this field; a duplicated list inherits its source's
                    // `startTime` with a strictly higher `order`, landing right after it
  isDefault: bool,
  isActive: bool,   // soft-delete flag — same convention as Task.isActive
  scheduledDays,    // 0=Sun..6=Sat — a default pushed down onto every Task in the list when changed
  qstashScheduleId, // string | null — the QStash schedule backing this list's start-time reminder push
                    // (see "Notifications" below); deterministic (`tasklist-<_id>`), re-upserted
                    // whenever startTime/scheduledDays/the company's timezone changes, null = none
}
```

### Task / TaskDefinition
Ownership-level — same reasoning as TaskList. `Task` is a lightweight list
**placement**, not a self-contained document; the check's actual content
lives one layer up on `TaskDefinition`, the company's reusable saved-task
catalog ("Company Task Catalog" — see `docs/features/task-lists.md`). The
same `TaskDefinition` can be placed in more than one list (e.g. the same
fridge-temp check in both the opening and closing lists), each placement
getting its own independent `TaskLog` history and streak strip. Every API
response is still the same flat, resolved shape client code has always
consumed — `lib/task-definitions.ts`'s `resolveTasks`/`resolveTask` join
these two collections server-side on every read.
```js
// Task — the placement
{
  _id,
  taskListId,
  companyId,
  definitionId,      // ref TaskDefinition, required
  projectedMinutes,  // this placement's *override* of the definition's default; null = inherit
  order,
  isActive: bool,
  scheduledDays,     // 0=Sun..6=Sat — which days this task is expected; also gates whether
                     //   it actually appears on the Tasks page that day, not just analytics
  successThreshold,  // how many of this week's scheduled days = 100%
}

// TaskDefinition — the catalog entry (name/icon/type/fields/NFC binding)
{
  _id,
  companyId,
  templateId,        // ref TaskTemplate this was cloned from, informational only, null for custom tasks
  name,              // 'Walk-in Fridge Temp'
  icon,              // lucide icon key, e.g. 'refrigerator' — see components/AppIcon.tsx
  taskType: 'form' | 'standard' | 'stopwatch' | 'checkbox',
  // form = the only creatable type — a structured checklist item, see formFields below
  // standard/stopwatch/checkbox = retired personal-habit timer types, kept only for schema
  //   compatibility with pre-pivot data — nothing in the UI creates them anymore
  formFields,        // FormFieldDef[] — only populated for form: { key, label,
                     //   type: 'number'|'text'|'boolean'|'checklist', unit?, min?, max?, items? }
                     //   checklist = one or more to-do sub-items (items) that must all be
                     //   checked to save, distinct from a single yes/no boolean answer
  projectedMinutes,  // default time budget; a placement's own projectedMinutes overrides it
  nfcTagUid,         // raw hardware UID of a bound physical NFC tag, scanned in-app; null = no
                     //   binding. Completing this task then requires a matching "Scan NFC"
                     //   instead of a plain Save — see docs/features/nfc.md's "In-app
                     //   scan-to-complete binding". Distinct from the separate NfcTag
                     //   collection used for tap-to-trigger. Binding lives here, one layer
                     //   above any single placement, so every list a task is placed in
                     //   shares the same tag.
  isActive: bool,    // soft-delete — blocked while any active Task placement still references it
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

### InventoryItemType / InventoryGroup / InventoryLog
A top-up count tracker, not a decrement ledger — nothing ever automatically
subtracts a count when a task completes. Ownership-level catalog entry plus
an append-only activity-level log — see `docs/features/inventory.md`.
```js
// InventoryItemType — the manager-defined catalog entry
{
  _id,
  companyId,
  name,              // 'Toilet Paper', 'Cases of Meat'
  unit,              // free-text display label ('rolls', 'cases', 'lbs') — display only, null = none
  parLevel,          // number | null — read at request time for the below-par red-tint/warning
                     //   cascade (item -> group), see docs/features/inventory.md's "Par-level alerting"
  groupId,           // ref InventoryGroup, or null = the implicit "Ungrouped" bucket — one group per
                     //   item, see docs/features/inventory.md's "Grouping"
  nfcTagUid,         // raw hardware UID of a bound physical tag, or null — see docs/features/nfc.md's
                     //   "Multi-target binding". Optional; by default (nfcRequiredToLog: false) never
                     //   GATES logging a count — a shortcut/verification, not a requirement — but see next.
  nfcRequiredToLog,  // bool, default false — manager opt-in per item. When true, logging a count DOES
                     //   require a matching scan (POST /api/inventory-logs -> 409 otherwise), the same
                     //   way TaskDefinition.nfcTagUid always gates task completion. See
                     //   docs/features/inventory.md's "NFC enforcement".
  createdByUserId,
  isActive: bool,    // soft-delete/archive — same convention as TaskDefinition.isActive
}

// InventoryGroup — a manager-defined organizational label ("Freezer," "Bar," "Dry Storage")
{
  _id,
  companyId,
  name,
  createdByUserId,
  isActive: bool,    // archiving does NOT archive its items — every member InventoryItemType's groupId
                     //   is set back to null ("Ungrouped") as part of the same request
}

// InventoryLog — one count entry, append-only (a correction is a new row, never an edit)
{
  _id,
  companyId,
  itemTypeId,        // ref InventoryItemType
  count,
  loggedByUserId,
  loggedAt,
  verifiedNfcUid,    // set only when this save's NFC scan matched the item type's own nfcTagUid; else null
}
```

### TaskInventoryLink
Optional join connecting a `TaskDefinition` to an `InventoryItemType`, so
completing that task also captures an inventory count in the same flow —
see "Task ↔ Inventory Linking" in `docs/features/inventory.md`.
```js
{
  _id,
  companyId,
  taskDefinitionId,  // ref TaskDefinition — lives at the definition level, shared by every list placement
  itemTypeId,        // ref InventoryItemType
  required: bool,    // a property of the PAIRING — the same item type can be required on one task, optional on another
}
```

### PushToken / MissedListAlert
Back the two shift-window alert types — see "Notifications" below and
`docs/features/notifications.md`.
```js
// PushToken — one row per device (not per user), a standing registration
// for ordinary remote notifications, distinct from User's own ephemeral
// liveActivityPushToken (tied to a single running timer's Live Activity).
// Registered by any signed-in company user (manager or employee) — not
// role-gated at registration time; "missed" alerts filter to managers only
// when fanning out, not by restricting who can hold a token.
{
  _id,
  userId,
  companyId,
  token,             // unique — a reinstalled app re-registers the same physical device under a
                     //   fresh token; the old row is pruned lazily on a BadDeviceToken APNs response
  environment,       // 'sandbox' | 'production' — inferred server-side, not trusted from the client
  platform,          // 'ios'
  lastSeenAt,
}

// MissedListAlert — one row per (company, list, day) the MISSED alert actually fired; exists purely
// to make the missed-list sweep idempotent (unique index on companyId+taskListId+date) and doubles
// as an audit trail. Start-time reminders (see "Notifications" below) need no equivalent table — each
// fire of a list's own QStash schedule is already a distinct, non-repeating occurrence by construction.
{
  _id,
  companyId,
  taskListId,
  date,              // YYYY-MM-DD, company-local
  sentAt,
}
```
`TaskList.qstashScheduleId` (see the TaskList model above) is the other
half of start-time reminders' own dedup-equivalent — the QStash schedule
ID itself, not a per-fire row.

---

## Multi-Tenancy

Every restaurant, gym, or hotel using Ch'rps is a `Company` — the tenant
anchor. Nothing in the Company model or its surrounding code is
restaurant-specific; gyms and hotels are expected customers too.

- **Ownership-level** collections (`TaskList`, `Task`, `TaskTemplate`,
  `InventoryItemType`, `InventoryGroup`) scope by `companyId` — they're the
  company's shared configuration, not any individual's data.
- **Activity-level** collections (`TaskLog`, `TaskListSession`,
  `InventoryLog`) scope by `companyId` *and* stamp a `performedByUserId`/
  `loggedByUserId` as an attribute, not part of the uniqueness key — any
  employee on shift might complete a given task or log a count, so the
  record is shared per task/day (or, for `InventoryLog`, just appended),
  not per person.
- `Todo` is scoped by both `companyId` and `userId` — still personal, but
  tenant-isolated.
- `AppIntentLink` stays scoped only to the specific user — it tracks which
  person's Shortcut is connected to a task, not company configuration.

**v1 still has no self-serve company *creation* UI** — a company's very
first manager is manually attached to a pre-created `Company` document
directly in MongoDB by the developer. Every *subsequent* member joins
through an in-app invite instead: a manager generates a link (`POST
/api/invites`) scoped to a company and a preset role, shares it
out-of-band, and opening it (`/invite/[token]`) is what attaches
`companyId`/`role` to that person's `User` document — see "Team & Invites"
below and `docs/features/team-invites.md`. `User.role`
(`'manager' | 'employee' | null`) defaults to `'manager'` on signup.
Managers also get real, in-app-built role-switching UI on the Team tab
(`PATCH /api/team/[userId]`) and can remove a teammate from the company
entirely (`DELETE /api/team/[userId]`, which sets `companyId`/`role` back
to `null` — the same "not yet provisioned" state as a brand-new sign-up).
Hand-editing a `User` document directly in MongoDB still works and is still
the only path for a company's first manager.

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

## Team & Invites

A **Team** tab (bottom nav) shows every company member's roster to any
signed-in company user; adding a new member is invite-token-only, never a
directory search across every Ch'rps company. A manager generates a link
from the Team tab (`POST /api/invites`), preset to a role and to either
`maxUses: 1` ("just this person") or a reusable cap; sharing and opening
that link is the only way `companyId`/`role` get attached to a new `User`
— see the `Invite` model above. Managers can also change a teammate's role
or remove them from the company (`PATCH`/`DELETE /api/team/[userId]`) —
both block rather than round-trip and fail if they'd leave the company with
zero managers, a lockout state nobody could recover from through the UI.

Full detail — redemption flow, API shapes, the bottom-nav layout change,
and deferred items (email-locked invites) — is in
`docs/features/team-invites.md`.

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
existed. The missed-shift-list-alert sweep (`app/api/cron/check-missed-lists`,
see "Notifications" below and `docs/features/notifications.md`) honors this
same `scheduledDays` check — a list with nothing scheduled today is skipped
entirely, same as it not rendering on the Tasks page.

See `docs/features/task-lists.md` for the full detail.

---

## Inventory

A **top-up count tracker**, not a decrement ledger — nothing in the app
ever automatically subtracts from an inventory count when a task is
completed (considered and rejected: "clean bathroom" doesn't reliably mean
"minus 4 rolls of toilet paper," and a count that drifted out of sync with
reality is worse than no count at all). A manager defines item types
(toilet paper, cases of meat...); anyone logs the *current* count when they
check/restock; that's the whole loop. Its own bottom-nav tab (5th slot,
after Reports) — see "Current App State" below.

Item types are organized into manager-defined **groups** ("Freezer," "Bar,"
"Dry Storage" — `InventoryGroup`, one per item, nullable = the implicit
"Ungrouped" bucket), and a `parLevel` drives a **below-par red-tint/warning
cascade** (item row → group header) computed at read time from each item's
latest logged count — see "Grouping" and "Par-level alerting" in
`docs/features/inventory.md`.

Uses the multi-target NFC binding model (`docs/features/nfc.md`'s
"Multi-target binding"): an `InventoryItemType.nfcTagUid` binds to a
**storage location**, not exclusively to that item type — the same
physical tag can (and often will) also be bound to a `TaskDefinition` at
the same location (e.g. the walk-in freezer's tag backing both "Log
Freezer Temperature" and "Meat Inventory Count"). By default, binding a tag
to an item type never gates logging a count the way a bound
`TaskDefinition` gates task completion — it's a shortcut/verification layer
only, manual entry always works, tag or no tag — **unless** a manager opts
that specific item into `nfcRequiredToLog`, at which point a matching scan
*is* required, mirroring `TaskDefinition`'s own enforcement exactly. See
"NFC enforcement" in `docs/features/inventory.md`.

A manager can also **link** one or more `InventoryItemType`s directly to a
task (`TaskInventoryLink` — see the Data Models section above), so checking
that area captures a count in the same flow — e.g. "Clean Bathroom" linked
to Toilet Paper, Soap, and Paper Towels, each independently marked required
or optional. When a task and a linked item share the same physical tag, one
NFC scan verifies both — no second scan. See "Task ↔ Inventory Linking" in
`docs/features/inventory.md`.

A manager-only **"Manage Inventory" hub** (`/inventory/manage`, reached from
the Inventory tab's bottom "Manage" button and a Profile page card, same
two-entry-point convention as `/tasks/manage`) is where item name/unit/
parLevel/group editing, NFC tag sync, and Groups CRUD all live — search +
"Scan to Find" included. The item detail/log screen
(`components/InventoryItemDetailView.tsx`) keeps a lightweight pencil
"Edit" icon in its own header, right under the top nav's profile icon, that
opens the same editor sheet without leaving the log-count flow.

Full detail — data model, roles, UI structure, task linking, and open
questions (par-level alerting, Reports integration) — is in
`docs/features/inventory.md`.

---

## Notifications

Two independent push alerts, structurally different mechanisms:

- **Start-time reminders** — fires at a shift-window `TaskList`'s exact
  `startTime`, via its own standing **per-list QStash schedule** (a cron
  expression with a `CRON_TZ=<company.timezone>` prefix, deterministically
  IDed `tasklist-<listId>` and stored on `TaskList.qstashScheduleId`) —
  not a poll. Skips silently if nothing's scheduled that day or everything's
  already done. Reaches **managers and employees** — a nudge to whoever's
  on shift.
- **Missed** — the list's derived end time (`startTime` + today's
  projected minutes) + a flat 30-minute grace period has passed with any
  of today's scheduled tasks still not in a terminal state (`done`/
  `missed`/`rest`). Driven by a single **shared recurring QStash sweep**
  (`POST /api/cron/check-missed-lists`, every 5 minutes — a poll, since
  "closed *around* 30 minutes ago" doesn't need to-the-minute precision).
  Reaches **managers only** — an escalation.

These use genuinely different QStash primitives on purpose: a poll rounds
to its own interval, and "starts now" read oddly arriving several minutes
early or late, so start-time reminders get one exact schedule per list
instead (`lib/qstash-schedules.ts`'s `upsertStartTimeSchedule`/
`deleteStartTimeSchedule`, wired into task-list create/update/delete/
duplicate and into a company-timezone change on Company Settings, since
every existing schedule's `CRON_TZ` goes stale otherwise). Both routes'
only auth boundary is verifying QStash's own request signature, since
neither has a user session. `Company.timezone` (see "Data Models" above)
is what lets both mechanisms ask "has this actually happened yet?"
independent of server UTC or any device's own offset — a company with no
timezone set is skipped by the sweep, and `upsertStartTimeSchedule`
refuses to create a schedule without one. `Company.notificationsEnabled`
is a single company-wide kill switch: the sweep filters disabled companies
out entirely, while `task-list-reminder` checks the flag at send time
instead (schedules keep firing regardless — not worth the QStash churn of
deleting/recreating every list's schedule on every toggle). Any signed-in
company user's device registers a standing `PushToken` (distinct from
`User.liveActivityPushToken`'s ephemeral, single-timer token) via
`@capacitor/push-notifications` — registration itself isn't role-gated,
since start-time reminders reach employees too; "missed" stays
manager-only via its own query filter at send time, not a
registration-time restriction. `MissedListAlert` makes the sweep
idempotent (write-then-send: the dedup row is written before the push
fan-out) and doubles as an audit trail — start-time reminders need no
equivalent table, since each QStash fire of a per-list schedule is
already a distinct, non-repeating occurrence by construction.

The missed-list window math (`deriveCollapseAfter`, `isPastGraceWindow`/
`MISSED_LIST_GRACE_MINUTES`) lives in `lib/task-list-window.ts`, shared
between the sweep and `components/TaskListCard.tsx`'s own client-side
collapse logic — one pure function, two callers, same pattern as
`lib/task-progress.ts`/`lib/placement-resolution.ts`.

Deferred beyond v1: par-level inventory alerts (same missed-list QStash
infra, a different trigger — natural fast-follow), a configurable grace
period for the missed alert, email fallback for a user who never grants
push permission, per-user/per-alert-type mute, and reconciling schedule
drift (nothing re-verifies a list's `qstashScheduleId` still matches a
live QStash schedule). QStash's free-tier 10-active-schedule cap is also
worth watching — every shift-window list consumes one. Full detail — data
model, both mechanisms, push payload shape, and failure handling — is in
`docs/features/notifications.md`.

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
- [x] Reports tab (renamed from Analytics) — task completion, variance, plus a manager/employee role split and a Logs history sub-tab — see docs/features/reports.md
- [x] Standalone To-Dos — see docs/features/todos.md
- [x] Live Activity (iOS Lock Screen timer) — see docs/features/live-activity.md
- [x] Manager-created/renamed/deleted task lists + list-level day-of-week scheduling — see "Task Lists" above
- [x] NFC tap-to-trigger tasks (Universal Links) — see docs/features/nfc.md
- [x] In-app NFC scan-to-complete task binding (distinct from the above) — see docs/features/nfc.md
- [x] Team tab + invite-token-only company joining, manager role-switching/removal — see "Team & Invites" above and docs/features/team-invites.md
- [x] Multi-target NFC binding (a tag can back more than one task/item type, with FAB-scan disambiguation) — see docs/features/nfc.md's "Multi-target binding"
- [x] Inventory tab (top-up count tracker, not a decrement ledger) — see "Inventory" above and docs/features/inventory.md
- [x] Task ↔ Inventory Linking (a task can capture one or more Inventory counts as part of its own form, with shared NFC verification when a tag backs both) — see "Inventory" above and docs/features/inventory.md's "Task ↔ Inventory Linking"
- [x] Inventory grouping, par-level red-tint/warning cascade, per-item `nfcRequiredToLog` enforcement, and the manager-only "Manage Inventory" hub — see "Inventory" above and docs/features/inventory.md
- [x] Shift-window alert push notifications — "start-time reminders" (per-list QStash schedule, managers+employees) and "missed" (shared QStash sweep, managers) — device registration for any company user, Company timezone/notificationsEnabled — see "Notifications" above and docs/features/notifications.md

Personal-habit-tracker features from before the restaurant pivot — the
timer-based Countdown/Stopwatch/Checkbox item types and the Sunday "Routine
Review" goal-vs-average-minutes comparison — have been retired. Future
phases (Goals, Virtues, Quotes) from the original "A Good Man" brief were
stripped out even earlier and are not planned here either. The recurring
"every thirty minutes" task-frequency concept is a distinct, unbuilt future
feature, not part of anything above. The native App Intents/Shortcuts
"Trigger Habit" action and the API-key-authenticated external API it (and
NFC's old silent-trigger flow) depended on were built, then later removed
entirely — not deprecated in place — since Shortcuts integration wasn't
considered load-bearing and the whole surface shared an unfixable gap with
`form`-type tasks; see `docs/project-structure.md`'s "iOS Native Shell"
section for the full removal note.

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
task, and a record of what was actually checked. The Reports tab's Overview
shows average actual vs projected per task, identifying where tasks
consistently over/under-run their time budget.

---

## Default Seed Data

Every seeded task is `taskType: 'form'` with its own `formFields`
(number readings or yes/no checklist entries) — see `lib/seed-templates.ts`
for each task's exact fields.

Icons are lucide icon keys (`components/AppIcon.tsx`'s `ICON_MAP`), not
emoji — the app renders a clean, monochrome icon set, not colorful pictorial
glyphs. Raw emoji only ever appears as a graceful fallback for legacy data
AppIcon doesn't recognize.

### Opening Shift
| name | icon | projectedMinutes |
|---|---|---|
| Walk-in Fridge Temp | `refrigerator` | 2 |
| Walk-in Freezer Temp | `snowflake` | 2 |
| Handwashing Stations Stocked | `droplets` | 3 |
| Floors & Surfaces Clean | `spray-can` | 5 |
| Opening Cash Count | `banknote` | 5 |
| Staff Uniform & Hygiene | `shirt` | 3 |
| Opening Walkthrough | `clipboard-check` | 5 |

### Mid-Shift
| name | icon | projectedMinutes |
|---|---|---|
| Line Temp Check | `thermometer` | 3 |
| Restock Check | `package` | 5 |
| Restroom Check | `toilet` | 3 |
| Trash & Recycling | `trash-2` | 5 |

### Closing Shift
| name | icon | projectedMinutes |
|---|---|---|
| Walk-in Fridge Temp (Close) | `refrigerator` | 2 |
| Walk-in Freezer Temp (Close) | `snowflake` | 2 |
| Equipment Powered Down | `power-off` | 5 |
| Deep Clean Kitchen | `sparkles` | 15 |
| Closing Cash Reconciliation | `banknote` | 10 |
| Trash Taken Out | `trash-2` | 5 |
| Doors Locked / Alarm Set | `lock-keyhole` | 3 |

### Anytime Tasks (standalone, never collapses)
| name | icon | projectedMinutes |
|---|---|---|
| Fridge | `refrigerator` | 2 |
| Freezer | `snowflake` | 2 |
| Men's Room | `toilet` | 3 |
| Women's Room | `toilet` | 3 |

See `lib/seed.ts` / `lib/seed-templates.ts` for the source of truth — this
table is a quick reference, not authoritative.

---

## Current App State
- Task Lists: BUILT — Opening/Mid-Shift/Closing shift lists + standalone Anytime Tasks list + manager-created custom lists, time-aware collapse/expand, dot progress, Edit button per list
- Task List Session: BUILT — guided multi-task walkthrough with live projected-finish/timeline
- Reports tab: BUILT — renamed from Analytics; manager sees the company-wide task completion/variance dashboard, employee sees a personal-only Overview (streak + weekly % + charts scoped to self), plus a chronological Logs history sub-tab for both roles, see `docs/features/reports.md`
- To-Dos: BUILT — standalone quick-capture list, shown on the Today view
- Live Activity: BUILT — iOS Lock Screen timer (see `docs/features/live-activity.md`); its Lock Screen button opens the app rather than completing a task directly (see the doc's "Open App button" section)
- Manager task-list management: BUILT — create/rename/schedule/delete, see "Task Lists" above
- NFC tap-to-trigger: BUILT — physical tags linked to a task (manager-only), triggered via Universal Links only by any company user, see `docs/features/nfc.md`
- NFC scan-to-complete binding: BUILT — manager scans a physical tag's raw UID onto a task from Manage Task List; completing that task then requires a matching in-app "Scan NFC" instead of a plain Save, see `docs/features/nfc.md`
- Multi-target NFC binding: BUILT — a tag can back more than one task and/or Inventory item type at once; the FAB's blind scan disambiguates with a picker when a scan resolves to more than one, see `docs/features/nfc.md`'s "Multi-target binding"
- Offline support: BUILT — native SQLite cache mirrors task lists/tasks/definitions/today's logs, task-log mutations (start/complete/miss/rest) queue locally and sync on reconnect, and in-app NFC scan-to-complete resolves against the local cache when offline; a cold app launch/full reload while offline is a known, documented gap (server-URL Capacitor mode), see `docs/features/offline.md`
- FAB button (center bottom nav): resumes the active timer when one exists; otherwise scans an NFC tag and opens whichever task or Inventory item it's bound to, disambiguating first if it's bound to more than one (`components/BottomNav.tsx`, see `docs/features/nfc.md`)
- Team & Invites: BUILT — Team tab roster (everyone) + manager-only invite-link generation/revocation and role-switching/removal, see "Team & Invites" above and `docs/features/team-invites.md`
- Inventory: BUILT — Inventory tab (top-up count tracker), grouped into manager-defined sections with search and a below-par red-tint cascade, manager-managed item-type catalog with optional NFC location binding (and a per-item `nfcRequiredToLog` toggle that turns that binding into an actual gate), plus a manager-only "Manage Inventory" hub (`/inventory/manage`) for name/unit/parLevel/group/tag editing and Groups CRUD, see "Inventory" above and `docs/features/inventory.md`
- Task ↔ Inventory Linking: BUILT — a manager can attach Inventory item types to a task (required or optional per link); the task form then captures a count per linked item on Save, sharing NFC verification with the task's own scan when the tags match, see "Inventory" above and `docs/features/inventory.md`'s "Task ↔ Inventory Linking"
- Notifications: BUILT — two independent shift-window alerts: "start-time reminders" fire at a list's exact startTime via its own per-list QStash schedule (managers+employees), "missed" fires 30min past the window's end via a shared QStash sweep every 5min (managers only, tasks still outstanding); device registration via `@capacitor/push-notifications` open to any company user, `Company.timezone`/`notificationsEnabled` drive both, see "Notifications" above and `docs/features/notifications.md`

Routine Review (the old Sunday goal-vs-average-minutes comparison) has been
retired — it doesn't fit a checklist-based work app.

**Bottom nav** (grew from Tasks/FAB/Analytics to four tabs, two per side,
when Team was added — see `docs/features/team-invites.md`; Analytics was
later renamed to Reports, see `docs/features/reports.md`; the reserved 5th
placeholder slot became Inventory, see `docs/features/inventory.md`):
1. Tasks (left 1) — Today view
2. Team (left 2) — company roster; managers also see Pending Invites + "+ Invite"
3. FAB (center) — active-timer resume indicator, or (when nothing is running) an NFC-scan shortcut to open a bound task or Inventory item directly (disambiguating first if the tag is bound to more than one)
4. Reports (right 1) — task trends, variance, adherence (manager) or personal streak/completion + charts scoped to self (employee), plus an Overview/Logs segmented control
5. Inventory (right 2) — item-type list grouped into sections with search, current counts (red-tinted when at/below par); tap to log a new count or view history; managers also see "+ Add Item Type" and a "Manage" button into `/inventory/manage`

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
10. Bottom nav: Tasks / Team / Reports / Inventory

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
QSTASH_TOKEN=              # Upstash QStash — see docs/features/notifications.md
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
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
