> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Virtues

The 4th bottom-nav tab (`app/(app)/virtues/page.tsx` → `components/ReviewView.tsx`) — a weekly-rotating virtue from whichever **Philosophy** (virtue set) the user has selected, a daily yes/no check-in across that philosophy's virtues, and a Sunday weekly-review summary. The component is still internally named `ReviewView` — "Review" was the tab's original name (per `CLAUDE.md`'s brief) before it was consolidated into "Virtues" at the nav/URL level; see "The `/review` redirect" below.

Virtues are no longer a single hardcoded 13-item list. A **Philosophy** is an admin-created, named virtue set (e.g. "A Good Man," "Franklin's 13 Virtues"); each user picks one as their active focus via a marketplace on the Virtues page. Everything that used to assume "13 virtues, one global set" — rotation math, check-in validation, weekly review, detail pages — now reads the count and contents of whichever philosophy is currently selected.

## Data model

**`Philosophy`** (`models/Philosophy.ts`, collection `philosophies`):
```ts
{ name, slug (unique), description, isSystem: boolean (default false), isActive: boolean (default true), order: number (default 0), createdAt, updatedAt }
```
No stored virtue count — every read that needs one computes `Virtue.countDocuments({ philosophyId, isActive: true })` (or the aggregate equivalent for a list) fresh, so it can never drift out of sync with the actual virtue documents. `isSystem: true` marks the two admin-seeded philosophies ("A Good Man," slug `agm`; "Franklin's 13 Virtues," slug `franklin-13`) — it has no enforcement effect in code beyond a "System" badge in the management UI; system philosophies can still be edited/deactivated by an admin like any other.

**`Virtue`** (`models/Virtue.ts`, collection `virtues`) — one document per virtue, now scoped to a philosophy:
```ts
{ philosophyId (ref Philosophy, required), name, slug (globally unique), tagline, displayName, order: number, essay: string (default ""), etymology: string (default ""), isActive: boolean (default true) }
```
`order` is 1..N **within its philosophy**, not a global 1–13 — it drives the rotation math below, scoped per philosophy. `slug` is still **globally** unique across every philosophy (a deliberate simplicity choice, not a bug) — `/virtues/[slug]` looks up a virtue by slug alone with no philosophy in the URL, so two philosophies can't both use the same slug for a same-named virtue; duplicating a philosophy (see below) auto-disambiguates copied slugs for exactly this reason.

**`VirtueCheckIn`** (`models/VirtueCheckIn.ts`, collection `virtuecheckins`) — one document per user per **day** (not per virtue):
```ts
{ userId, philosophyId (ref Philosophy, required), date: string, weekStartDate: string, answers: [{ virtueId, virtueName, answer: "yes" | "no" }], createdAt }
```
`philosophyId` is stamped server-side at write time from the user's *current* `User.selectedPhilosophyId` — never trusted from the client, and never migrated retroactively if the user later switches philosophies. This means a user's check-in history stays correctly attributed to whichever philosophy was active on each historical day, and every read (`GET /api/virtue-checkins`, all three query modes) is scoped by `philosophyId` too, so switching philosophies never mixes one philosophy's history into another's summary. A unique compound index on `{ userId, date }` still means the whole day's answers live in one document's `answers` array, not one row per virtue.

**`User`** (`models/User.ts`) — adds `selectedPhilosophyId: ObjectId | null (ref Philosophy, default null)` alongside the pre-existing `apiKey` and `virtueWalkthroughSeen` fields. `null` means the user hasn't picked a philosophy yet (every brand-new user, and every pre-existing user before the one-time migration below ran) — the Virtues page renders the marketplace instead of the normal check-in UI in that state.

**Admin** is centralized in `lib/admin.ts`'s `isAdmin(email)` (hardcoded email check + `SKIP_AUTH` fallback) — every admin-gated route and page imports this one helper now, rather than duplicating the check. **`models/User.ts` still has no `role` field** — `CLAUDE.md`'s "Admin Role" section implying a stored `role: 'admin'` remains aspirational, not implemented.

`models/Quote.ts` does not exist — matches `CLAUDE.md`'s own "NOT BUILT (Phase 4)" note; still accurate.

## Week convention and rotation (`lib/virtue-dates.ts`)

- `isoWeekNumber(date)` — standard ISO-8601 week number.
- `weekStartDate(date)` — the **Monday** of that ISO week, `YYYY-MM-DD`. Deliberately different from `StreakDots`/Analytics' Sunday-anchored `calendarWeekDates` — see [routines.md](routines.md#weekly-schedule--success-threshold).
- `currentVirtueOrder(date, virtueCount) = virtueCount > 0 ? ((isoWeekNumber(date) - 1) % virtueCount) + 1 : 1` — **fully deterministic and stateless**, generalized from a hardcoded `% 13`. Every caller resolves "how many active virtues does the selected philosophy have" (a `countDocuments`) before calling this — there is no default `virtueCount`, so no caller can silently keep assuming 13. Switching philosophies mid-cycle just means the next call passes a different count; nothing needs to be reset or migrated.
- The server reads "today" as `new Date().toISOString()` (UTC) when loading `/virtues` — the same class of UTC-vs-local-day edge case flagged elsewhere in this app's docs (matters only right around midnight in timezones behind UTC).

## Philosophy marketplace and switching

`app/(app)/virtues/page.tsx` resolves the caller's `User.selectedPhilosophyId` server-side via `lib/philosophy.ts`'s `resolveSelectedPhilosophyId(userId)` before rendering anything else.

- **`null`** (no philosophy selected) → `ReviewView.tsx` renders `PhilosophyMarketplaceInline` (from `components/PhilosophyManageSheet.tsx`) in place of the normal check-in/history UI — a card per active `Philosophy` (name, description, computed virtue count); tapping one `PATCH`es `/api/user/profile` with `{ selectedPhilosophyId }` and reloads into the normal Virtues page for it.
- **set** → the normal check-in/history UI renders as before, scoped to that philosophy's virtues and check-in history.

A **"Manage"** button sits next to the "This Week's Virtue" banner at all times (regardless of whether a philosophy is currently selected) and opens `PhilosophyManageSheet` — the same card grid as an overlay, for switching later. Admins additionally see, on every card: **Virtues** (drills into that philosophy's virtue list — add, drag-reorder via `@dnd-kit` reusing the pattern from `RoutineEditView.tsx`, inline edit of word/sentence-description/paragraph-description/etymology, soft-delete via `isActive: false`), **Duplicate** (deep-copies the philosophy's active virtues into a new one — fresh `_id`s, disambiguated slugs, not references), and **Deactivate/Activate**. A **"+ New Philosophy"** control (admin-only) creates an empty philosophy to add virtues to. The sheet is rendered wider than the app's usual 420px mobile shell (`sm:max-w-2xl`) — comfortable for authoring virtue text on desktop, still usable stacked on mobile.

`lib/philosophy.ts`'s `resolveSelectedPhilosophyId` goes through the raw Mongo driver collection (`User.collection.findOne`), not the Mongoose model, specifically so it also works for `SKIP_AUTH`'s `dev-local-user` — that id isn't a valid ObjectId, so a Mongoose `findById`/`findByIdAndUpdate` throws a CastError before ever reaching the database (the same issue `getOrCreateApiKey` in `lib/api-key.ts` solves for API keys). `PATCH /api/user/profile` does the same for writes, so the marketplace/switching flow is fully exercisable locally under `SKIP_AUTH=true`, with a real, persisted (not in-memory) `dev-local-user` document.

## Daily check-in

Two entry points, both mounting the same `components/VirtueCheckInModal.tsx`:
1. **Inline from the Routines page** — tapping the "Virtue Check-in" special `RoutineItem` (`itemType: "virtue_checkin"`, see [routines.md](routines.md#item-types)) sets local state in `RoutinesView.tsx` and opens the modal without navigating away.
2. **From `/virtues` directly** — the "Today's Check-in" button in `ReviewView.tsx`.

The modal fetches the *selected philosophy's* active virtues (`GET /api/virtues`, scoped server-side to `User.selectedPhilosophyId`) and shows one YES/NO row per virtue — every virtue in the philosophy, every day, not just this week's, matching Franklin's "track all daily, focus on one" framing. Every virtue must be answered before Submit enables (`answeredCount === virtues.length` — already dynamic, not hardcoded, so it needed no change for this feature). `POST /api/virtue-checkins` resolves the caller's `philosophyId` server-side, `400`s if they somehow have none selected (defense-in-depth — the UI can't reach this state), and upserts the day's document with `philosophyId` stamped in.

**Honesty rules are thinner than `CLAUDE.md` describes.** The route's only real date validation is a loose UTC-band check — the submitted date must fall within roughly a day on either side of "now," chosen to cover any timezone's local "today/yesterday" without the server knowing the user's offset. `CLAUDE.md`'s other two claimed rules — "no editing past answers once submitted" and "locked after Sunday midnight" — **are not enforced anywhere in code**. The write is an unconditional upsert (now also unconditionally re-stamping `philosophyId` to whatever's currently selected), so re-`POST`ing for an already-answered date silently overwrites it. `ReviewView.tsx` disables its own check-in button once today's document already exists, but that's a client convenience, not a server-side lock; a direct `POST` would still succeed.

Completing the modal calls `POST /api/routine-logs` for the `virtue_checkin` item with a **hardcoded `actualMinutes: 5`** — not derived from any timer, unlike every other timed item in the app.

## Weekly review

Triggered from `RoutinesView.tsx`'s "Weekly Review" special `RoutineItem` (`itemType: "weekly_review"`) or the "Start This Week's Review" button on `/virtues` — both open `components/WeeklyReviewModal.tsx` inside `ReviewView`. Unlike the daily check-in, there's no path that opens this modal without going through `/virtues`.

**Sunday-only gating is client-UI-only, in exactly one place**: `ReviewView.tsx` computes `isSunday` from the server-passed (UTC) date and disables the button on other days. `WeeklyReviewModal.tsx` itself has a prop comment claiming its `date` "must be Sunday" but enforces nothing — it renders for whatever date it's given. Nothing server-side checks day-of-week at all.

Content: fetches `GET /api/virtue-checkins?weekStart=...` (scoped to the selected philosophy) for the ISO week containing the given date, tallies yes/total per virtue client-side, shows a strongest/needs-work pair, a full per-virtue score bar (a separate local 3-band color scale — `≥70% olive / ≥40% amber / else burgundy` — not `lib/routine-progress.ts`'s pacing math), and a "next week's virtue" teaser computed as `((nextWeekNum - 1) % virtueCount) + 1` — `virtueCount` is now a required prop threaded down from the page (`ReviewView` → `WeeklyReviewModal`), replacing the old hardcoded `% 13`. Confirming calls `POST /api/routine-logs` for the `weekly_review` item with a **hardcoded `actualMinutes: 10`**, same caveat as the daily check-in.

## Virtue detail — two separate, non-identical UIs

- **`components/VirtueDetailView.tsx`** — the full page at `/virtues/[slug]`. Shows an order badge (`{order} / {virtueCount}`, both server-resolved for that virtue's own philosophy — the old hardcoded `/ 12` bug is fixed), a "This Week" pill, displayName, tagline, and **both etymology and essay, admin-editable inline** (gated by `isAdmin`). The "This Week" pill only shows when the viewed virtue's `philosophyId` **also** matches the viewer's currently-selected philosophy — otherwise browsing to a different philosophy's virtue at the same `order` via a direct link would incorrectly show it as current.
- **`components/VirtueSheet.tsx`** — a bottom sheet opened from the Routines page (tapping the "This Week's Virtue" banner, no navigation). Shows order ("Week X of N," `N` now a real per-philosophy count passed down as `virtue.virtueCount`, not hardcoded 13), displayName, tagline, and **essay only** — no etymology shown or editable at all.

These are independently maintained with real feature drift between them (only the full page supports etymology editing) — a change to one's editing UX doesn't propagate to the other.

## `/virtues` page structure (`ReviewView.tsx`)

This-week banner (links to the slug page) + Manage button → `VirtuesHowItWorks` info-icon walkthrough trigger (auto-opens once via `User.virtueWalkthroughSeen`) → "Today's Check-in" button → "Start This Week's Review" button (Sunday-gated per above) → a 7-day/30-day toggle → a summary (overall %, days checked in, strongest/needs-work virtue) → one row per virtue with a mini history dot-strip, each linking to `/virtues/[slug]`. When no philosophy is selected, everything after the Manage button is replaced by the marketplace (see above).

## The `/review` redirect

`app/(app)/review/page.tsx` is a one-shot server redirect — forwards `mode`/`date`/`return` query params and 302s to `/virtues`. `BottomNav.tsx`'s nav tabs (`RIGHT_TABS`) point at `/virtues`, not `/review` — this isn't a bug or an unfinished feature, it's a compatibility shim left behind after "Review" was consolidated into "Virtues" at the URL level, kept so any old bookmarked/shared `/review` links still land somewhere.

## Onboarding walkthrough

`components/VirtuesHowItWorks.tsx` — an info-icon button opening `components/VirtueWalkthroughModal.tsx`, plus `autoOpen` support (opens itself once, shortly after mount, driven by `!User.virtueWalkthroughSeen`). The modal is a static 4-section explainer (Where This Comes From / How It Works / Yes or No / The Sunday Review); dismissing it any way (backdrop, X, "Got It") `PATCH`es `/api/user/profile` with `{ virtueWalkthroughSeen: true }` first. The root-level `virtue-system-app-medium.md` is the literal source text this copy was pulled from — not a stale planning doc, it's still verbatim in sync with the shipped modal. It predates the Philosophy feature and still describes the old single-list framing; not updated as part of this change since it isn't shipped UI, just source prose.

## Auto-provisioning

`ensureVirtueCheckInItems(userId)` (`lib/seed.ts`) is idempotent (bails if a `virtue_checkin` or `weekly_review` item already exists for the user) and requires an existing evening `RoutineGroup` (bails silently if none). It appends two `RoutineItem`s to the end of that group: `{ name: "Virtue Check-in", icon: "compass", projectedMinutes: 5, itemType: "virtue_checkin" }` and `{ name: "Weekly Review", icon: "shield", projectedMinutes: 10, itemType: "weekly_review" }` — matching the hardcoded `actualMinutes` values completing them logs, above. Called from `app/(app)/routines/page.tsx` alongside the app's other per-user seed functions, on every page load. This only seeds the two special *items* — the `Virtue`/`Philosophy` reference documents themselves are seeded separately, once, by the migration script below.

## One-time migration (`scripts/migrate-philosophies.mjs`)

Run manually, exactly once per environment (`node --env-file=.env.local scripts/migrate-philosophies.mjs`), **not** wired into app boot — unlike the `ensure*()` per-user seed functions above (safe to re-run on every page load because they only add missing per-user defaults), re-running this as an ongoing rule would silently default every brand-new user to "A Good Man" and they'd never see the marketplace. Idempotent in the sense that it's safe to *re-run* if interrupted (every step checks "has this already been done" first), but never invoked from application code. Steps: creates the "A Good Man" `Philosophy` (`isSystem: true`, slug `agm`) for the pre-existing hand-inserted 13 virtues if it doesn't exist yet; backfills `philosophyId` onto every `Virtue`/`VirtueCheckIn` document missing it; backfills `selectedPhilosophyId` onto every `User` document where it's unset; seeds Benjamin Franklin's own 13 virtues (his short precepts, public domain, from his autobiography) as a second `isSystem: true` Philosophy (slug `franklin-13`), so the marketplace has a real second option out of the box.

## Files

- `models/Philosophy.ts` — admin-created virtue sets (marketplace entries).
- `models/Virtue.ts` — virtue reference documents, scoped to a philosophy via `philosophyId`.
- `models/VirtueCheckIn.ts` — one document per user per day, stamped with the philosophy active at write time.
- `lib/virtue-dates.ts` — `isoWeekNumber`, `weekStartDate` (Monday-anchored), `currentVirtueOrder(date, virtueCount)` (stateless, per-philosophy rotation).
- `lib/seed-virtues.ts` — re-exports the above three; seeds nothing despite the name.
- `lib/philosophy.ts` — `resolveSelectedPhilosophyId(userId)`, shared by every page/route that needs the caller's active philosophy; raw-collection reads/writes so it also works for `dev-local-user`.
- `lib/admin.ts` — shared `isAdmin(email)` check, used by every admin-gated philosophy/virtue route and page.
- `lib/seed.ts`'s `ensureVirtueCheckInItems` — per-user idempotent seeding of the two special evening `RoutineItem`s.
- `scripts/migrate-philosophies.mjs` — one-off migration + Franklin's-13 seed (see above).
- `app/(app)/virtues/page.tsx` → `components/ReviewView.tsx` — the 4th nav tab; renders the marketplace or the normal UI depending on `User.selectedPhilosophyId`.
- `app/(app)/virtues/[slug]/page.tsx` → `components/VirtueDetailView.tsx` — full-page detail, admin essay+etymology editing, philosophy-aware "This Week" pill.
- `app/(app)/review/page.tsx` — dead-URL redirect shim to `/virtues`.
- `components/VirtueSheet.tsx` — the other virtue-detail UI (bottom sheet from the Routines page), essay-only.
- `components/VirtueCheckInModal.tsx` — the daily check-in modal (virtue count driven by the API response, no change needed).
- `components/WeeklyReviewModal.tsx` — the Sunday summary modal (client-gated only; `virtueCount` now a required prop).
- `components/PhilosophyManageSheet.tsx` — the marketplace grid (`PhilosophyMarketplaceInline`, used inline when no philosophy is selected) and the "Manage" overlay sheet (default export), including the admin virtue editor.
- `components/VirtuesHowItWorks.tsx` / `components/VirtueWalkthroughModal.tsx` — onboarding explainer, content sourced from `virtue-system-app-medium.md`.

## Depends on

[`api/virtues-api.md`](../api/virtues-api.md) for the API surfaces (`/api/philosophies`, `/api/virtues`, `/api/virtue-checkins`, and `/api/user/profile`'s `selectedPhilosophyId` handling); the `virtue_checkin`/`weekly_review` `RoutineItem` types and their completion path through `/api/routine-logs`, documented in [routines.md](routines.md) and [routines-api.md](../api/routines-api.md).
