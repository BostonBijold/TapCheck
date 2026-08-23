> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# NFC Tags

A physical NFC tag, written externally (e.g. with the NFC Tools app) to a plain URL, that toggles a linked habit's timer on tap: start it, tap again to close it. Underlying toggle mechanics — the state machine, the single-active-timer sweep, session auto-advance — are entirely shared with [`external-api.md`](../api/external-api.md)'s `trigger-habit` endpoint (see [`nfc-api.md`](../api/nfc-api.md) for the full breakdown); this doc covers what's specific to the tag-tap flow.

## How it differs from `trigger-habit` / Shortcuts

`trigger-habit` requires an iPhone Shortcut carrying the user's API key and the target `routineItemId` baked in — iOS-only, and reassigning which habit a physical tag triggers means editing that Shortcut. This feature instead:

- Writes only a stable app URL to the tag: `https://<host>/nfc/t/<tagUID>`, where `tagUID` is an arbitrary string you choose (e.g. `desk-01`) — no API key or Mongo id ever touches the physical tag.
- Works from a normal logged-in browser/PWA session on any NFC-capable phone, not just iOS Shortcuts.
- Reassigning a tag to a different habit is a database update (relink from the habit's edit panel) — the physical tag itself is never rewritten.

## Linking a tag to a habit

Done from the habit's own edit panel, not a separate tags screen: open **Manage Routines → [a group] → Edit**, expand a habit's row (`components/RoutineEditView.tsx`), and its "NFC Tag" section shows:

- **Not linked** → a text input for the tag's UID (whatever you're about to write to the physical tag) plus a "Link NFC tag" button. Submitting calls `POST /api/nfc-tags` with `{ tagUID, routineItemId, groupId }`.
- **Linked** → the tag's label/UID plus an "Unlink" button (`DELETE /api/nfc-tags/[id]`).

This replaced the raw, read-only "Item ID" block that used to live in the same spot (still referenced by `docs/api/external-api.md` for manual Shortcut setups) — see [`nfc-api.md`](../api/nfc-api.md#session-authenticated-routes).

## Tapping a tag

Tapping the physical tag opens its URL, `app/(app)/nfc/t/[tagUID]/page.tsx` — a session-authenticated server page, not an API endpoint. What happens depends on the linked item's own state:

| State of the linked item's log today | Tap does |
|---|---|
| No log yet, `missed`, or `rest` | **Start** the timer. |
| `paused` | **Resume** — banked elapsed time carries forward. |
| `in_progress` (this item is the one running) | **Close** it — `actualMinutes` derived server-side from `startedAt` + banked `pausedSeconds`, never trusted from the client. If the tag has a `groupId`, auto-advances to the next unlogged item in that group. |
| A *different* item is `in_progress` | That item auto-completes (existing single-active-timer invariant), then this one starts — the jump case. |
| `done` already today | **No-op** — "Already completed today." Tapping a completed item's tag again doesn't reopen it; use the app's own Undo for that. |

After a start (including an auto-advance following a close), the page redirects to `/routines?resumeTimer=1`, which reuses the app's existing resume mechanism (`RoutinesView`'s `autoResumeTimer` effect) to open the right screen — no separate NFC-specific timer UI. A plain close with nothing to advance to redirects to `/routines`.

An unrecognized or not-yet-linked `tagUID` shows a short message pointing back to the habit's edit panel to link it — there's no in-page "pick a habit" picker, since linking always starts from the habit side.

## Files

- `models/NfcTag.ts` — the tag → item mapping.
- `app/(app)/nfc/t/[tagUID]/page.tsx` — the resolve-and-toggle page.
- `app/api/nfc-tags/route.ts`, `app/api/nfc-tags/[id]/route.ts` — session-authenticated tag CRUD.
- `lib/routine-log-actions.ts` (`toggleRoutineItemLog`) — the shared start/close/no-op decision, also used by `trigger-habit`.
- `components/RoutineEditView.tsx` — the per-habit "NFC Tag" link/unlink section.

## Depends on

- [`docs/api/nfc-api.md`](../api/nfc-api.md) — `/api/nfc-tags*`, and the resolve page's own behavior.
- [`docs/api/external-api.md`](../api/external-api.md#post-apiexternaltrigger-habit) — `trigger-habit`, the other caller of `toggleRoutineItemLog`.
- The Routine Logs section of [`docs/api/routines-api.md`](../api/routines-api.md) — `startInProgressLog`/`completeInProgressLog`, which `toggleRoutineItemLog` is built on.
