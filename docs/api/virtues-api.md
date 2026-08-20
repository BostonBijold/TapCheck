> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Virtues API

Covers `Philosophy` (virtue sets), the `Virtue` reference collection, daily `VirtueCheckIn` records, and philosophy selection — the data behind [features/virtues.md](../features/virtues.md). Completing the `virtue_checkin`/`weekly_review` special `RoutineItem`s still goes through the ordinary `POST /api/routine-logs` (documented in [routines-api.md](routines-api.md)) — not duplicated here.

**Auth**: `GET /api/virtues` is the one route in this app with **no auth check at all** for the read itself, though the philosophy it resolves against is still the caller's own session-derived selection (see below) — virtues are otherwise global, read-only reference content. Every other route below follows the usual pattern: NextAuth session, with a `SKIP_AUTH`-gated dev fallback, `401` otherwise — except the admin-only routes, which check `isAdmin(email)` (`lib/admin.ts`: hardcoded email, or `SKIP_AUTH`) instead, `403` otherwise.

## `GET /api/philosophies`

Session-authenticated (`401` if not). Admins (`isAdmin`) get every philosophy, active and inactive — the management sheet needs to see deactivated ones. Everyone else gets `isActive: true` only — the marketplace.

Response: array of
```ts
{ _id, name, slug, description, isSystem, isActive, order, virtueCount }
```
`virtueCount` is computed fresh via a `Virtue.aggregate` grouped by `philosophyId` (`isActive: true` virtues only) — never stored, so it can't drift.

## `POST /api/philosophies`

**Admin-only.** Body: `{ name, slug, description?, order? }`. `400` if `name`/`slug` missing, or if `slug` is already in use (globally unique). `order` defaults to `max existing order + 1` if omitted. Always creates with `isSystem: false, isActive: true` — an empty philosophy with no virtues yet; add those via `POST /api/virtues` afterward, or via `POST /api/philosophies/[id]/duplicate` to start from an existing one's virtues instead. `201` with the same shape as the GET response (`virtueCount: 0`).

## `PATCH /api/philosophies/[id]`

**Admin-only.** Body: any subset of `{ name, description, order, isActive }`. This is also how "deactivate/activate" works — no separate endpoint. `404` if the id doesn't match an existing philosophy. Response: the updated philosophy (no `virtueCount` field — the management sheet re-fetches the list after any mutation rather than trusting this response's shape to match the list response).

## `POST /api/philosophies/[id]/duplicate`

**Admin-only.** Body: `{ name, slug }` for the copy. `404` if the source id doesn't exist; `400` if the new `slug` is already in use. Creates a new `Philosophy` (`isSystem: false` always, even if the source was a system philosophy), then deep-copies every `isActive` virtue from the source into it — fresh `_id`s, same `order`/`displayName`/`tagline`/`essay`/`etymology`, new `philosophyId`, and `slug` rewritten to `` `${sourceSlug}-${copySlug}` `` (since `Virtue.slug` is globally unique, verbatim copies would otherwise collide with the originals). Not references — editing the copy never touches the source. `201` with `{ _id, name, slug, description, isSystem, isActive, order, virtueCount }` (`virtueCount` here is the source's count at copy time, not re-queried).

## `GET /api/virtues`

No auth check, but not fully public either: resolves which philosophy to read from server-side, via `lib/philosophy.ts`'s `resolveSelectedPhilosophyId(userId)` against the caller's own `User.selectedPhilosophyId` — a `?philosophyId=` override is accepted **only for admins** (`isAdmin(session?.user?.email)`), used by the management sheet to browse any philosophy's virtues including inactive ones (`activeOnly` becomes `false` in that case). A non-admin always gets their own selection, active virtues only, and `[]` if they haven't selected a philosophy yet.

Response: array of
```ts
{ _id, philosophyId, name, slug, tagline, displayName, order, essay, etymology, isActive }
```
sorted by `order`.

## `POST /api/virtues`

**Admin-only.** Body: `{ philosophyId, name, slug, tagline, displayName, essay?, etymology?, order? }`. `400` if `philosophyId`/`name`/`slug`/`tagline`/`displayName` are missing, or if `slug` is already in use (globally unique across every philosophy). `order` defaults to `(count of virtues in that philosophy) + 1` if omitted — matching the `RoutineItem` append convention. `201` with the created virtue, same shape as the GET response above.

## `PATCH /api/virtues/[id]`

**Admin-only.** Body: any subset of `{ essay, etymology, displayName, tagline, order, isActive }` — extended from the original essay/etymology-only version; `name`/`slug`/`philosophyId` still have no update path (an admin who needs to change a virtue's core identity deletes and re-adds it). `isActive: false` is the soft-delete mechanism, same convention as elsewhere in this app. `404` if the id doesn't match an existing virtue.

Response: `{ _id, philosophyId, name, slug, tagline, displayName, order, essay, etymology, isActive }`.

## `PATCH /api/virtues/reorder`

**Admin-only.** Body: `{ philosophyId, items: [{ _id, order }] }` — same bulk-update shape as `PATCH /api/routine-items/reorder`. Each update is scoped by both `_id` **and** `philosophyId` (`updateOne({ _id, philosophyId }, ...)`), so a malformed or malicious id list can't touch virtues belonging to a different philosophy. `400` if `philosophyId` is missing or `items` is empty/not an array. Response: `{ ok: true }` — callers optimistically reorder client-side rather than reading a response body.

## `GET /api/virtue-checkins`

Session-authenticated. Resolves the caller's `philosophyId` first via `resolveSelectedPhilosophyId` — **every mode below is additionally scoped by it**, so switching philosophies never mixes one philosophy's check-in history into another's summary. If the caller has no philosophy selected, each mode returns its "nothing to report" shape instead of erroring (`null` for `?date=`, `[]` for `?weekStart=`, an empty/zeroed summary object for `?days=`) — the UI never actually calls this in that state (the marketplace replaces the check-in flow), but it's a safe default regardless.

Three mutually exclusive modes depending on which query param is present, checked in this order:

- **`?date=YYYY-MM-DD`** — the single check-in document for that date (and the caller's philosophy), or `null` if none exists. Response: the raw `VirtueCheckIn` document (or `null`) — `{ _id, userId, philosophyId, date, weekStartDate, answers: [{ virtueId, virtueName, answer }], createdAt }`.
- **`?weekStart=YYYY-MM-DD`** — every check-in document with that exact `weekStartDate` and the caller's `philosophyId` (i.e. one ISO week — see `lib/virtue-dates.ts`'s Monday-anchored `weekStartDate`), sorted by `date` ascending. Response: array of raw documents, same shape as above. This is what `WeeklyReviewModal.tsx` fetches and tallies client-side.
- **`?days=7|30[&localDate=YYYY-MM-DD]`** — a rolling window ending at `localDate` (client-supplied local date; falls back to server UTC "today" if omitted — the same UTC-vs-local caveat as `GET /api/habits` in [habits-api.md](habits-api.md)), clamped to `[7, 30]`. Computed server-side, scoped to the caller's philosophy, one row per virtue **in that philosophy** (`VirtueModel.find({ philosophyId, isActive: true })`):

  ```ts
  {
    days: number;
    dates: string[];      // oldest → newest, the trailing window (not a fixed calendar week)
    checkInDays: number;  // how many days in the window have a check-in document at all
    overallPct: number;   // average of each engaged virtue's pct, rounded
    strongest: { virtueId, virtueName, pct } | null;
    needsWork: { virtueId, virtueName, pct } | null;  // null unless at least 2 virtues have data
    virtues: Array<{
      virtueId, virtueName, slug, order,
      dots: Array<"yes" | "no" | null>;  // one per date in `dates`, null = no check-in that day
      yes: number; total: number; pct: number;  // yes/total over days actually checked in, not days.length
    }>;
  }
  ```
  Note this window is a plain **trailing N days**, not the fixed Sunday–Saturday calendar week used by `StreakDots`/Analytics (`lib/week-dates.ts`) — the two date-window systems are unrelated.

No query param at all → `400 { error: "Missing query param" }`.

## `POST /api/virtue-checkins`

Session-authenticated. Request body: `{ date: string; answers: Array<{ virtueId, virtueName, answer: "yes" | "no" }> }` (`VirtueCheckInModal.tsx` always sends every virtue in the currently-selected philosophy).

**Validation is a single loose date-window check, not the stricter rules `features/virtues.md` warns `CLAUDE.md` overclaims**: `diffDays = (Date.now() - Date.parse(date + "T12:00:00Z")) / 86400000` must fall within `(-1, 2)` — i.e. roughly "yesterday through tomorrow" by UTC, a deliberately generous band chosen to cover every timezone's local "today or yesterday" without the server knowing the caller's offset. Outside that range: `400 { error: "You can only check in for today or yesterday." }`. There is **no check preventing re-submission** of an already-answered date (see below) and **no day-of-week/Sunday-lock check** here at all.

Resolves the caller's `philosophyId` via `resolveSelectedPhilosophyId` after the date check; `400 { error: "No philosophy selected" }` if they have none — defense-in-depth, since the UI shouldn't be able to reach this state (the marketplace replaces the check-in flow until a philosophy is picked).

Write: `weekStartDate` is (re)computed server-side from `date` via `weekStartDate()` (never trusts a client-sent value), then an **unconditional upsert** on `{ userId, date }` — `$set`s `weekStartDate`, `philosophyId`, and `answers`. Because it's unconditional, posting again for a date that already has a document silently overwrites its prior answers (and re-stamps `philosophyId` to whatever's currently selected, even if it differs from the original) — "no editing past answers" is enforced nowhere server-side; it only holds in practice because the UI (`ReviewView.tsx`) disables the button once today's document exists.

Response: the upserted document, same shape as the `?date=` mode above.

## `PATCH /api/user/profile`

Session-authenticated. Accepts any subset of:
- `virtueWalkthroughSeen: boolean`
- `selectedPhilosophyId: string | null` — what the marketplace's "tap to select" action calls. `null` explicitly clears the selection (drops the user back into the marketplace on next load). A non-null value must reference a real, **active** `Philosophy` — validated server-side (`400 { error: "Invalid philosophy" }` if not), never trusted from the client.

`400` if neither key is present, or if a present key fails its own validation. Writes go through `User.findByIdAndUpdate(..., { upsert: true })` for real users, but through the raw driver collection (`User.collection.updateOne`) for `SKIP_AUTH`'s `dev-local-user` — its id isn't a valid ObjectId, so the Mongoose path would throw a CastError before the upsert ever ran; see [features/virtues.md](../features/virtues.md#philosophy-marketplace-and-switching). Response: `{ ok: true }`.

## Consumed by

[`features/virtues.md`](../features/virtues.md).
