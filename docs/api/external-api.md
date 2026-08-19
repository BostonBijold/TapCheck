> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# External API

A separate, API-key-authenticated surface for triggering the app from outside a browser session — built for an iPhone Shortcut fired by an NFC tag tap, but not tied to that specifically. Deliberately kept apart from [routines-api.md](routines-api.md)'s session-authenticated endpoints, which are shaped for the app's own client, not a third-party caller.

## Auth

Every request must include a valid API key, checked against `User.apiKey` (`models/User.ts`) via `findUserIdByApiKey` in `lib/api-key.ts` — this is how the request's `userId` is determined; there is no session/cookie involved at all. The key can be supplied any of three ways, and all three are equivalent:

- Header: `x-api-key: <key>`
- Query param: `?apiKey=<key>`
- JSON body field: `{ "apiKey": "<key>" }`

Missing key → `401 { error: "Missing API key" }`. Key that doesn't match any user → `401 { error: "Invalid API key" }`.

### `GET /api/user/api-key`
Session-authenticated (normal app auth, not the API key itself) — this is how the app displays the key to the user, not how external callers authenticate. Returns `{ apiKey: string }`, generating and persisting one via `getOrCreateApiKey` on the user's first request if they don't have one yet ("generated once" — never rotates an existing key automatically). Format: `boak_<48 hex chars>`.

Displayed on the Profile page (`components/ProfileView.tsx`) with a copy-to-clipboard button, for pasting into a Shortcut.

> **Dev-mode caveat**: `SKIP_AUTH`'s local dev user (`dev-local-user`) isn't a real Mongo `User` document (no adapter-driven sign-in ever created one), so it can't hold a persisted key. `getOrCreateApiKey` falls back to a deterministic, unpersisted key, `boak_dev_<userId>`, recognized as a special case by `findUserIdByApiKey` — this only exists so the external endpoint is testable locally without touching the database; it's meaningless in production.

## `POST /api/external/start-timer`

Starts a timer exactly like the in-app standalone "Start Timer" action, by delegating to the same `startInProgressLog` helper described in [routines-api.md](routines-api.md#routine-logs) — the single-active-timer invariant (auto-**completing** whatever else was running, not pausing it — that softer behavior is specific to navigating inside an already-open `RoutineSession`, see below) applies identically here, not as a separate reimplementation. If this same item was left `paused` by an in-app session earlier, starting it here resumes it — its banked `pausedSeconds` carry forward rather than resetting to zero.

Params (accepted via JSON body or query string, body takes precedence when both are present):

| Param | Required | Meaning |
|---|---|---|
| `routineItemId` | yes | Raw Mongo `_id` of the `RoutineItem` to start. Displayed read-only (`select-all`, no copy button) on that item's inline edit panel in `components/RoutineEditView.tsx`. |
| `routineGroupId` | no | Raw Mongo `_id` of the `RoutineGroup` the item belongs to. Displayed read-only the same way on the group's edit page. If given, the item must actually belong to that group (validated — see below). |
| `date` | no | `YYYY-MM-DD`. Defaults to **server UTC date** (`new Date().toISOString().split("T")[0]`) — there's no client to supply a local timezone for an out-of-band caller. Same caveat as `GET /api/habits` in [habits-api.md](habits-api.md); can matter near midnight. |

Validation, in order: item must exist and belong to this user (`404` otherwise); if `routineGroupId` given, that group must exist and belong to this user (`404`), and the item's `groupId` must match it exactly (`400 "Item does not belong to that group"` otherwise). Malformed ids (not valid ObjectId strings) return `400`, not a 500.

Notably, this validation doesn't check `timeOfDay` — a `routineGroupId` pointing at a Habit group (see [habits.md](../features/habits.md)) is accepted the same as any other group. The in-app "Start Routine" button is deliberately hidden for Habit groups, so a session-anchored resume for one is currently only reachable through this endpoint, not through any in-app flow.

Effect:
- **`routineItemId` only** — starts that item's timer, `sessionGroupId: null`. Identical outcome to tapping "Start Timer" in the app.
- **`routineItemId` + `routineGroupId`** — same timer start, plus `sessionGroupId` is set on the log. The next time the app is opened (or the FAB's resume indicator is tapped — see [timer.md](../features/timer.md)), `RoutinesView.openInProgressTimer` sees the `sessionGroupId`, resolves the group and the item's index within it, and opens `RoutineSession` directly at that item — mid-timer — instead of the plain Routines home or the standalone timer screen.

Response: `{ ok: true, log: <serialized RoutineLog> }` (same `serializeLog` shape used throughout routines-api.md, including `sessionGroupId` and `pausedSeconds`).

### Interaction with a resumed session's own navigation

Once inside a session opened this way, moving between items *inside that session* (advancing via Done/Missed/Rest, or tapping another row to jump) no longer goes through this endpoint's sweep-to-done behavior — it uses `switchActiveLog` instead (see [timer.md](../features/timer.md#single-active-timer-pause-instead-of-complete-or-run-concurrently)), which **pauses** whatever was running rather than completing it. Only a genuinely external event completes something out from under the session: if a *second* call to this endpoint starts a different item (with or without `routineGroupId`) while the session is open, that still goes through `startInProgressLog`'s full sweep and auto-completes whatever the session currently has active — the session's foreground-revalidation effect (timer.md) detects this and adopts the real server result rather than fighting it. An item the session itself navigated away from, with no external call involved, is only ever `paused`, not completed, and stays resumable — either by jumping back to it in the same session, or by hitting this endpoint again for that exact `routineItemId`.

`RoutineSession.advance()` re-fetches the day's logs from the server on every step and only treats `done`/`missed`/`rest` as "handled" — an `in_progress` or `paused` item (from any source) becomes current instead of being skipped, and the search wraps back to the start of the item list rather than ending the session just because it reached the end, so a paused or never-visited item is never silently left behind. This is a live server check every time, not a snapshot taken when the session opened, specifically so a concurrent external trigger for a different item in the same group is picked up correctly.

## Consumed by

[`features/timer.md`](../features/timer.md) (the resume-into-session behavior) and, indirectly, [`features/routines.md`](../features/routines.md) (where the item/group IDs this endpoint needs are surfaced for copying).
