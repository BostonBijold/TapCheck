> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Notifications (shift-window alerts)

**Status: BUILT.** Two independent push alerts, both driven by the same
QStash sweep against a shift-window task list's own schedule:

- **Time to start** — nobody's logged anything against the list a few
  minutes after its `startTime`. Reaches **managers and employees** (a
  reminder to whoever's on shift).
- **Missed** — the list's window closed with tasks still outstanding.
  Reaches **managers only** (an escalation).

See CLAUDE.md's "Notifications" section for a short summary; this doc has
the full detail.

**v1 scope**: push-only, one digest alert per list per day per alert type.

**Explicitly out of scope for v1** (see "Deferred / open questions" below):
par-level inventory alerts (same infra, different trigger — a fast-follow),
email fallback, per-manager mute, per-list configurable grace periods, time
clock (not built at all yet, unrelated).

## Why QStash, not Vercel Cron

This needs a background job that runs independent of any user request —
Vercel's own Cron Jobs are the obvious first thought, but the Hobby plan
caps cron at once-per-day, fired sometime within an hour window, which is
useless for "alert within a few minutes of a checklist not being started."
Pro lifts that to per-minute cadence, but only via a $20/mo/seat upgrade.

**Upstash QStash** decouples the trigger from Vercel's plan entirely: it's
an external HTTP scheduler that calls one of our own API routes on a cron
schedule, free up to 1,000 messages/day and 10 active schedules — more
than enough at current and near-term scale (the live schedule fires every
5 minutes, 288 messages/day total, regardless of how many companies exist
or how many alert types get checked per run, since the job itself fans out
to every company server-side — standard cron's finest granularity is 1
minute, but that alone would consume the entire free-tier daily budget, so
5 minutes was picked as comfortably within it while still well under
either alert's own grace period).

The tradeoff: one more third-party account/dependency, and the receiving
route needs to verify QStash's request signature (`Upstash-Signature`
header) rather than trusting Vercel's own cron auth pattern
(`CRON_SECRET` bearer token) — see "The QStash job" below.

## `Company.timezone`

**`models/Company.ts` has `timezone: string | null`** — an IANA zone name
(`"America/Chicago"`), not a raw UTC offset, so DST is handled for free by
the platform `Intl` API (`lib/task-list-window.ts`'s `minutesNowInZone`/
`todayInZone`) — no new date-library dependency added.

- **No self-serve company *creation* UI exists in this codebase** (see
  CLAUDE.md's "Multi-Tenancy" — a company's first manager is still attached
  by hand in MongoDB), so there is no signup-time form field to capture a
  browser-guessed timezone from — that part of the original spec doesn't
  apply until a real company-creation flow exists. **What's actually
  built**: `timezone` is a plain manager-editable field on Company
  Settings (`components/CompanySettingsView.tsx`, `GET`/`PATCH
  /api/company/settings`), including a "Detect" button that reads
  `Intl.DateTimeFormat().resolvedOptions().timeZone` from whichever
  manager's browser clicks it — the same detection the original spec
  wanted, just triggered manually from Settings instead of automatically
  at signup.
- **A company with `timezone: null` is skipped entirely by the sweep** (see
  "The QStash job" below) — never guessed at, never defaulted silently.
- **Existing companies** (pre-dating this field being load-bearing) are
  backfilled by `scripts/backfill-company-timezone.mjs` — same one-off,
  manually-run pattern as `scripts/migrate-task-definitions.mjs`. It
  defaults every company with a null timezone to `America/Chicago` and
  logs each one so a developer can correct it by hand (or point the
  manager at Company Settings) once its real zone is known — not run
  automatically, and not a guess anyone should trust without follow-up.

## Data model

- **`models/PushToken.ts`** — `{ userId, companyId, token, environment:
  "sandbox" | "production", platform: "ios", createdAt, lastSeenAt }`. One
  row per device, not per user. Distinct from the Live Activity push token
  (`User.liveActivityPushToken`, ephemeral and tied to one running timer)
  — this is a persistent, standing device token for ordinary remote
  notifications. Registered by any signed-in company user, manager or
  employee (see "Device registration" below) — this route/model doesn't
  know or care which alert type(s) a given token ends up receiving.
  Index: `{ token: 1 }` unique (a reinstalled app re-registers the same
  physical device under a fresh token via an upsert-on-token write; the
  old row is simply orphaned and pruned lazily on a `BadDeviceToken`/
  `Unregistered` APNs response — see "Failure handling" below),
  `{ companyId: 1 }` (the alert fan-out query).
- **`models/MissedListAlert.ts`** — `{ companyId, taskListId, date, sentAt
  }`. Dedup guard for the **missed** alert. Unique index on `{ companyId:
  1, taskListId: 1, date: 1 }`, enforced via a `try`/`catch` on the Mongo
  duplicate-key error (`code 11000`) around `create()` in the cron route,
  not a separate find-then-write. Doubles as a lightweight audit trail
  ("did the alert fire, and when") for free.
- **`models/NotStartedAlert.ts`** — same shape and same dedup convention as
  `MissedListAlert`, in a separate collection rather than a `type` field on
  that one model — the two alerts have independent triggers, timing, and
  audiences, and each fires once per list per day completely independently
  of the other.
- **`Company.notificationsEnabled: boolean`** (default `true`) — a single
  company-wide kill switch covering **both** alert types, editable from
  Company Settings alongside `timezone` above. No per-alert-type or
  per-manager mute in v1 (see "Deferred" below).

No changes to `TaskList`/`Task`/`TaskDefinition`/`TaskLog` — this reads
existing state, it doesn't add fields to the things it's checking.

## Device registration (client side)

Reuses the general shape already established for Live Activity's push-token
forwarding (`components/NativeBootstrap.tsx`,
`lib/native/routine-activity.ts`), but this is a genuinely new capability,
not a reuse of the existing ActivityKit token flow — ordinary remote
notifications need their own explicit permission grant:

1. **`@capacitor/push-notifications`** (official Capacitor plugin) is
   installed and synced into the iOS project (`npx cap sync ios`) — same
   "prefer an official/community plugin over hand-written native code"
   pattern already used for `@capacitor-community/sqlite` and
   `@capacitor/network`.
2. **`lib/native/push-notifications.ts`**'s `registerAlertPushNotifications()`,
   called from `components/NativeBootstrap.tsx` on every native cold
   start. It first checks `GET /api/session/role` for a non-null
   `companyId` — a small, deliberately narrow endpoint kept just for this
   gate (see that route's own comment: no other client code should grow a
   habit of polling it instead of receiving role/companyId as a page prop,
   the way every other gated screen already does) — and bails silently for
   anyone not attached to a company. **Both managers and employees are
   prompted** — this broadened from an earlier manager-only version once
   the "time to start" alert (which reaches employees too) was added; see
   "History" below.
3. It checks/requests permission (`PushNotifications.checkPermissions()` /
   `requestPermissions()`). iOS shows its own system permission prompt —
   not skippable, not customizable, same category of OS-owned prompt as
   the NFC Universal Link confirmation.
4. On grant, `PushNotifications.register()` yields a token via the
   `registration` listener → `POST /api/push-tokens { token }`.
   **Deviation from the original spec**: `environment` is not sent by the
   client at all — `app/api/push-tokens/route.ts` infers it server-side
   from `process.env.NODE_ENV`, the closest available proxy to
   `LiveActivityPlugin.swift`'s own `#if DEBUG` tagging (a real Xcode
   build-config flag isn't visible to this endpoint the way it is to
   native Swift code). Known imperfection, documented inline in the
   route: a TestFlight (Distribution-signed, real APNs *sandbox*) build
   talking to this same production Vercel deployment would still be
   tagged `"production"` — accepted for v1, revisit if it causes real
   missed pushes.
5. A denied/undetermined permission is not re-prompted automatically on
   every launch (respecting the OS's own "don't be naggy" norms). **Not
   yet built**: the original spec's dismissible in-app banner for a
   manager whose company has `notificationsEnabled: true` but no
   registered token — deferred, see "Deferred / open questions" below.

**Native rebuild required**: adding `@capacitor/push-notifications` means
`npx cap sync ios` alone (already run) isn't enough to actually get this
running on a device — that only updates the iOS project's Swift Package
references. The plugin's native code has to be compiled into the app
binary via Xcode (Clean Build Folder, then Build & Run to a **physical
device** — the Simulator can't receive real APNs pushes, same constraint
as Live Activity) before the permission prompt can appear at all.

## What counts as "not started"

Only **shift-window lists** (`startTime` non-null) are eligible — an
anytime list never has a start time to be late against. The condition,
evaluated per `(company, list, today)` in
`app/api/cron/check-missed-lists/route.ts`, alongside "missed" below:

1. The window has opened: now (via `minutesNowInZone(company.timezone)`)
   is at or past `startTime`.
2. **Grace period**: `startTime` + a flat **5 minutes**
   (`NOT_STARTED_GRACE_MINUTES` in `lib/task-list-window.ts`) has passed.
   Deliberately much shorter than the missed alert's 30 minutes — this is
   a quick nudge that the window opened, not an escalation.
3. **Zero** `TaskLog` rows exist for `(companyId, today, any of this
   list's visible tasks)` — i.e. truly nothing has been logged, not
   "started but incomplete" (that's the missed alert's job, evaluated
   independently and possibly later the same run).
4. A list with **zero** tasks scheduled today (every task's
   `scheduledDays` excludes today) is skipped entirely — same as "missed."
5. No `NotStartedAlert` row already exists for `(companyId, taskListId,
   today's date)`.

Because this check only needs to know "does at least one `TaskLog` row
exist," and the missed check (below) needs the exact same `TaskLog` query
to compute its own outstanding count, the cron route fetches that query
once per list and reuses it for both checks.

## What counts as "missed"

Only **shift-window lists** (`startTime` non-null) are eligible — an
anytime list never closes, so "missed by the window" has no meaning for
it (see [task-lists.md](task-lists.md)'s "Time-aware collapse"). The
condition, evaluated per `(company, list, today)`, independently of and
usually after "not started" above (a list can trip "not started," get
going a minute later, and never trip this one — or trip both, in the rare
case it's started late enough to blow through its own window on the same
run):

1. Compute the list's derived end time via `lib/task-list-window.ts`'s
   `deriveCollapseAfter(startTime, totalProjectedMinutes)` — the exact
   same pure function `components/TaskListCard.tsx` calls client-side for
   its own collapse logic (extracted out of that component specifically
   so the two can never diverge — same "one pure function, two callers"
   pattern as `lib/task-progress.ts`/`lib/placement-resolution.ts`).
   `totalProjectedMinutes` is summed only over today's **visible**,
   non-checkbox tasks (`lib/task-visibility.ts`'s `isTaskVisibleOn`,
   applied before the sum — unlike the client's own inline computation in
   `TaskListCard.tsx`, which currently sums over every task regardless of
   today's visibility; a known, pre-existing divergence between the two,
   not introduced by this feature — see that file's comments).
2. **Grace period**: end time + a flat **30 minutes**
   (`MISSED_LIST_GRACE_MINUTES` in `lib/task-list-window.ts`). Before
   that, nothing fires, even if the list is behind.
3. Now must be past that grace-adjusted time.
4. At least one task scheduled today (`isTaskVisibleOn`) on that list is
   **not** in a terminal state (`done`/`missed`/`rest`) — i.e. still
   `pending`/`in_progress`/`paused`, or has no `TaskLog` row at all for
   today.
5. A list with **zero** tasks scheduled today is skipped entirely.
6. No `MissedListAlert` row already exists for `(companyId, taskListId,
   today's date)`.

**One alert per list per day per type, a digest, not one push per missed
task** — "Closing Checklist not finished — 3 tasks outstanding" is more
actionable and far less spammy than three separate pushes.

## The QStash job

- **Schedule**: `*/5 * * * *` (every 5 minutes — 288 messages/day, well
  within QStash's free-tier 1,000/day cap; tightened from the original
  15-minute proposal once free-tier headroom was confirmed), targeting
  `POST https://chrps.vercel.app/api/cron/check-missed-lists`. Created via
  the `@upstash/qstash` schedule API — see "Setting it up" below for the
  actual schedule id.
- **Route**: `app/api/cron/check-missed-lists/route.ts` — the name
  predates the "not started" alert and stayed as-is rather than being
  renamed, since a live QStash schedule already targets this exact URL and
  migrating it (create new schedule, delete old, redeploy) wasn't worth
  the risk for a naming nicety; the route's own header comment flags this.
  Verifies the request came from QStash via `@upstash/qstash`'s
  `Receiver.verify()` against the `Upstash-Signature` header, using
  `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` (both, since
  Upstash rotates signing keys). Rejects (`401`) anything that doesn't
  verify — this route is otherwise unauthenticated (no user session), so
  signature verification **is** the auth boundary here, same conceptual
  role `assertNfcVerified` plays for a scan.
- **Logic**: for every `Company` with `notificationsEnabled !== false` and
  a non-empty `timezone` — filtered in application code, not via an exact
  Mongo match, since every Company in this app is hand-inserted directly
  in MongoDB and can easily be missing either field entirely; an exact
  `{ notificationsEnabled: true }` query would silently exclude those,
  same reasoning as the `?? true` fallback used elsewhere — compute "now"
  in that company's zone, find its shift-window lists, and for each one:
  skip immediately if the window hasn't even opened yet
  (`isBeforeWindow`), otherwise fetch its visible tasks and today's
  `TaskLog` rows once and apply BOTH the "not started" and "missed"
  conditions above, independently. Each qualifying condition writes its
  own dedup row **first** (write-then-send — a crash mid-send can't cause
  a duplicate on the next run) before fanning out its own push
  (`lib/notifications.ts`'s `sendNotStartedAlert()` or
  `sendMissedListAlert()`). Each company and each list is wrapped in its
  own `try`/`catch` (logged, not thrown) so one bad list/company can't
  abort the whole sweep.
- **Batching**: one job run processes every company in a single request —
  fine at current scale, revisit (chunking, a QStash fan-out-per-company
  pattern) only if company count grows enough that one route invocation
  risks the function's max duration.

## Push payload

- **Title**: the task list's own name (e.g. "Closing Shift") for both
  alert types.
- **Body**:
  - Not started: `"Was due to start at H:MMam/pm — nothing logged yet"`.
  - Missed: `"N task(s) not finished — window closed at H:MMam/pm"`.
- **Custom data**: `{ taskListId, date, alertType: "not_started" |
  "missed" }` for deep-linking (`alertType` added alongside the second
  alert type so a future tap handler can distinguish them).
- **Tap behavior**: **not yet built.** The original spec called for a
  `pushNotificationActionPerformed` listener navigating to
  `/tasks?openTaskListId=<id>&date=<date>`; this doc records that as the
  intended behavior, but no listener wiring it up currently exists in
  `lib/native/push-notifications.ts` or elsewhere — a tap today just opens
  the app to wherever it would normally land. Flagged in "Deferred / open
  questions" below since it's a real gap, not a deliberate v1 cut like the
  others in that list.

## Failure handling

- **APNs `BadDeviceToken` / `Unregistered`** response for a given token →
  `lib/apns.ts`'s `sendAlertPush` throws an `ApnsPushError` carrying the
  parsed `reason`; `lib/notifications.ts`'s shared `sendPushToUsers` send
  loop (used by both `sendNotStartedAlert` and `sendMissedListAlert`)
  deletes that `PushToken` row inline when it matches either reason. A
  stale token (uninstalled app, reissued token) stops being retried rather
  than accumulating as dead weight.
- **QStash's own retry**: if `check-missed-lists` itself errors or times
  out, QStash retries the whole invocation on its own schedule — the
  write-then-send ordering above means a retried run won't re-alert a
  list/type pair that already got its dedup row written (the
  `create()` call's duplicate-key error is caught and treated as "already
  alerted, skip"), even if the *push send* itself is what failed
  originally. Accepted tradeoff: a send failure after the dedup row is
  written means that list silently doesn't get a retry push this run —
  fine for v1 given how low-stakes a missed push (vs. a missed *task*) is.

## API routes

| Route | Method | Gate | Purpose |
|---|---|---|---|
| `/api/push-tokens` | POST | any signed-in company user | register/refresh this device's token |
| `/api/session/role` | GET | any signed-in user | tiny session lookup, used only to gate the native permission prompt to signed-in company users — see "Device registration" above |
| `/api/cron/check-missed-lists` | POST | QStash signature only | the sweep — checks both alert types, see "The QStash job" above |
| `/api/company/settings` | GET/PATCH | any signed-in user (GET) / manager (PATCH) | gains `timezone`/`notificationsEnabled` fields alongside the existing `notificationSound` |

## Files

- `models/PushToken.ts`, `models/MissedListAlert.ts`, `models/NotStartedAlert.ts` — new.
- `models/Company.ts` — gained `notificationsEnabled`; `timezone` already
  existed (stubbed) and is now load-bearing.
- `lib/task-list-window.ts` — new. The extracted, shared window math —
  `deriveCollapseAfter`, the missed alert's 30-minute grace
  (`isPastGraceWindow`/`MISSED_LIST_GRACE_MINUTES`), and the not-started
  alert's 5-minute grace (`isPastStartGrace`/`NOT_STARTED_GRACE_MINUTES`).
  `components/TaskListCard.tsx` was refactored to call the shared
  `deriveCollapseAfter`/`isPastWindow`/`isBeforeWindow` instead of its own
  local copies.
- `lib/notifications.ts` — new. A shared `sendPushToUsers()` send loop plus
  two thin callers, `sendNotStartedAlert()` (fans out to every company
  user) and `sendMissedListAlert()` (managers only) — both wrap
  `lib/apns.ts`'s signing/HTTP2 send with their own payload shape.
- `lib/apns.ts` — gained `sendAlertPush()` and the `ApnsPushError` class,
  alongside the pre-existing `sendLiveActivityPush()`.
- `lib/native/push-notifications.ts` — new. `registerAlertPushNotifications()`,
  gated on having a company (not on role — see "History" below).
- `app/api/cron/check-missed-lists/route.ts`, `app/api/push-tokens/route.ts`,
  `app/api/session/role/route.ts` — new.
- `app/api/company/settings/route.ts` — gained `timezone`/
  `notificationsEnabled` on both `GET` and `PATCH`.
- `components/CompanySettingsView.tsx` — gained a timezone `<select>` (plus
  a browser-detect button) and a single "Checklist Alerts" toggle switch
  covering both alert types, alongside the existing `notificationSound`
  control.
- `components/NativeBootstrap.tsx` — gained a call to
  `registerAlertPushNotifications()` alongside the existing Live Activity
  push-token forwarding call.
- `scripts/backfill-company-timezone.mjs` — new, one-off migration script.

## Setting it up

1. ~~Create an Upstash account, a QStash instance — free tier.~~ Done.
2. ~~Set `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
   `QSTASH_NEXT_SIGNING_KEY` locally (`.env.local`).~~ Done locally — still
   needs setting on Vercel's production env before the route can verify
   real requests in prod. Already documented in `project-structure.md`'s
   Secrets Policy list and CLAUDE.md's Environment Variables section.
3. ~~Create the schedule.~~ Done — `scd_78Le9ufNBjK2MwErCFtrNz4nsfXH`,
   `*/5 * * * *`, targeting
   `https://chrps.vercel.app/api/cron/check-missed-lists`. Manage/inspect
   it via the Upstash console (QStash → Schedules) or `GET
   {QSTASH_URL}/v2/schedules/scd_78Le9ufNBjK2MwErCFtrNz4nsfXH`. **Note**:
   this schedule is already live and will start firing every 5 minutes
   against production the moment `QSTASH_CURRENT_SIGNING_KEY`/
   `QSTASH_NEXT_SIGNING_KEY` are set there too (until then, every
   invocation just 401s at the signature-verification step and no-ops) —
   pause it first (`POST .../schedules/<id>/pause`) if that's not wanted
   yet.
4. **Still outstanding**: run `scripts/backfill-company-timezone.mjs`
   against production once, so pre-existing companies aren't silently
   skipped by the sweep forever (the sweep itself already correctly skips
   any company with no timezone set — this step is about actually getting
   them a timezone, not sweep correctness).
5. Xcode: **the `App` target's `aps-environment` entitlement already
   exists** (added for the Live Activity work — confirmed, not assumed,
   by inspecting `ios/App/App/App.entitlements`), so no new entitlement is
   needed for ordinary alert push. Still outstanding: enabling
   **Background Modes → Remote notifications** under the `App` target's
   Signing & Capabilities isn't strictly required for a visible alert push
   (that capability is for *silent*/background-waking pushes, which this
   feature doesn't use), so it's left undone; add it later only if a
   future feature needs the app to react to a push while backgrounded.
6. **A fresh native rebuild is required** — see "Device registration"
   above's last paragraph. `npx cap sync ios` alone doesn't ship the new
   plugin's native code.
7. A physical device is required to test end to end, same APNs constraint
   documented in `live-activity.md` — the Simulator can't receive real
   pushes.

## History: "not started" alert added, registration broadened to employees

The feature originally shipped with only the "missed" alert
(manager-only), matching the original spec this doc was built from. A
"time to start" alert — nobody's logged anything a few minutes after a
list's own `startTime` — was added shortly after, per product feedback
that a manager-only escalation at window-close was reactive; a quick
nudge right when a window opens is proactive and reaches the people who
can actually act on it in the moment. Deciding factors, made explicitly at
the time rather than assumed:
- **Audience**: both managers and employees (not managers-only, which
  would have reused the existing infrastructure with zero registration
  changes; not employees-only, which would have cut managers out of a
  useful oversight signal). This is why `app/api/push-tokens/route.ts`
  and `lib/native/push-notifications.ts` both dropped their manager-only
  gates — the missed alert stayed manager-only by keeping its own
  `role: "manager"` filter in `lib/notifications.ts`, rather than the
  registration layer restricting who can even hold a token.
- **Grace period**: 5 minutes, short enough to be a genuine reminder
  rather than noise, chosen over 15 minutes or firing immediately at
  `startTime` (a few minutes' normal lateness shouldn't trigger anything).

## Deferred / open questions

- **Tap-to-deep-link behavior** — see "Push payload" above. This is a real
  gap in the current build, not a deliberate v1 cut.
- **In-app "no token registered" banner** — see "Device registration"
  above. Not yet built.
- **Par-level inventory alerts** — same QStash infra, a different
  condition (`InventoryLog` latest count vs. `InventoryItemType.parLevel`)
  and a different dedup key. Natural fast-follow once this ships; not
  bundled into v1 to keep the first version small and testable.
- **Per-list configurable grace periods** — v1 uses one flat 5-minute
  constant (not started) and one flat 30-minute constant (missed) for
  every shift-window list, every company. A closing list arguably
  deserves different grace than an opening one; deferred until there's a
  real complaint either way.
- **Email fallback** for a user who never grants push permission — no
  transactional email provider exists in this stack yet. Out of scope for
  v1.
- **Per-user mute, or per-alert-type toggle** — v1 is a single
  all-or-nothing `Company.notificationsEnabled` covering both alert types
  for every user. Deferred.
- **A "resolved" follow-up push** once a late list finally gets finished —
  not built; felt like it'd add noise more than value. Revisit if managers
  actually ask for it.
- **Multi-location digest** — out of scope until Ch'rps has a real
  multi-location data model at all (today, `Company` is a flat
  single-tenant unit).
- **Self-serve company creation / signup-time timezone capture** — see
  "`Company.timezone`" above. Not built because the underlying
  company-creation flow itself doesn't exist yet in this codebase, not a
  cut specific to this feature.

## Depends on

[`task-lists.md`](task-lists.md) — `TaskList.startTime`, the derived
collapse/end-time math, `scheduledDays`/`isTaskVisibleOn`, and the
`TaskLog` states this checks for completeness. [`live-activity.md`](live-activity.md) —
`lib/apns.ts`'s signing/send logic, reused rather than rebuilt.
[`offline.md`](offline.md) — none functionally, but worth noting: a list
finished entirely offline and not yet synced back to the server will look
"still open"/"not started" to this sweep until the device reconnects and
flushes its queue; an edge case, not treated as a bug to fix here.
