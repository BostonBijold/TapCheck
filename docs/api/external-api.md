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
| `routineItemId` | yes | Raw Mongo `_id` of the `RoutineItem` to start. No longer surfaced read-only in the UI — that block in `components/RoutineEditView.tsx`'s inline edit panel was replaced by the NFC tag link control (see [`nfc.md`](../features/nfc.md)). If you need the raw id for a manual Shortcut setup, `GET /api/nfc-tags` returns `routineItemId` for any item that already has a linked tag. |
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

## `POST /api/external/trigger-habit`

A single, bidirectional endpoint for a Shortcut fired by an NFC tap: the same call either **starts** or **completes** a habit, decided entirely by current server state (is there an active timer, does it match the tapped item, and is it already done today) — never by a param the caller sends. This is what makes one NFC tag workable for a whole routine: tap it once to start the first item, tap the next tag to both finish that item and start the next, and so on.

The state-transition decision itself — everything in "Behavior" below — lives in `toggleRoutineItemLog` (`lib/routine-log-actions.ts`), not inline in this route. It's shared with the session-authenticated NFC resolve page (`app/(app)/nfc/t/[tagUID]/page.tsx`, see [`nfc-api.md`](nfc-api.md) and [`features/nfc.md`](../features/nfc.md)) — both callers do their own auth and item/group ownership validation, then hand an already-validated item to the same function so the toggle logic itself is never duplicated.

Same auth as `start-timer` (see [Auth](#auth) above). Params, also accepted via JSON body or query string (body takes precedence):

| Param | Required | Meaning |
|---|---|---|
| `routineItemId` | yes | Raw Mongo `_id` of the `RoutineItem` being tapped. |
| `routineGroupId` | no | Raw Mongo `_id` of the `RoutineGroup` the item belongs to. If given, the item must belong to that group — same validation as `start-timer` (`400 "Item does not belong to that group"` otherwise). Also what drives auto-advance in Case 2 below. |
| `date` | no | `YYYY-MM-DD`. Defaults to server UTC date, same caveat as `start-timer`. |

Validation is identical to `start-timer`, in the same order: item must exist and belong to this user (`404`); if `routineGroupId` given, group must exist and belong to this user (`404`) and the item's `groupId` must match it (`400`); malformed ObjectId strings return `400`, not a 500.

### Behavior — four cases

Which case applies is determined first by the tapped item's own log for today, then by looking up this user's single active (`in_progress`) log, if any, and comparing its `routineItemId` to the tapped one:

**Case 0 — the tapped item is already `done` today.** A no-op — returns immediately with `alreadyDone: true`, `completed: null`, `started: null`. Tapping an already-completed item's tag again doesn't reopen it; that's what the app's own Undo button is for. (This case didn't exist before `toggleRoutineItemLog` was factored out — the endpoint used to fall through to Case 1 and silently restart an already-done item. Fixed as part of adding the NFC resolve page, which needed this same guard.)

**Case 1 — no active log exists anywhere for this user.** Starts the tapped item:
- `standard`/`stopwatch` items → `startInProgressLog` (identical to `start-timer`'s own effect, including `sessionGroupId` anchoring if `routineGroupId` was passed).
- `checkbox`, `virtue_checkin`, `weekly_review` (anything with no timer) → `startImmediateLog` writes a terminal `done` log immediately, `actualMinutes: 0` — it never passes through `in_progress` at all.

Both halves call through `completeStrayInProgressLogs` first regardless (unconditional server-side enforcement of the single-active-timer invariant, not trusted to the caller) — in Case 1 that's a no-op since we already know nothing's active, but it's the same code path Cases 2 and 3 rely on.

**Case 2 — the tapped item IS the currently active one.** Completes it via `completeInProgressLog` (`state: "done"`, `actualMinutes` derived from `startedAt` + banked `pausedSeconds`, same math as `PATCH /api/routine-logs`'s timer-completion branch — see [routines-api.md](routines-api.md#routine-logs)). If `routineGroupId` was supplied, resolves the next not-yet-logged item in that group's `order` via `findNextItemInGroup` and starts it exactly per Case 1's rules; if there's no next item, or `routineGroupId` was omitted, completion is all that happens.

**Case 3 — a different item is active.** Completes whatever *was* active (same as Case 2's completion, using that log's own `date`, not necessarily the request's `date`), then starts the tapped item per Case 1's rules — regardless of whether `routineGroupId` was supplied on this call. This is the jump case: the user lands on whichever item they tapped, not the next one in sequence.

All three cases use the sweep-to-**complete** pattern (`startInProgressLog` / `startImmediateLog` / `completeInProgressLog`), never `switchActiveLog`'s pause-and-resume pattern — every transition through this endpoint is terminal for the item being left behind. `switchActiveLog` remains reserved for in-session navigation inside an already-open `RoutineSession` (see the Interaction section above); this endpoint doesn't touch it.

### Response

```ts
{
  ok: true,
  completed: SerializedRoutineLog | null,   // item just completed, if any (Case 2/3)
  started: SerializedRoutineLog | null,     // item just started, if any (Case 1, Case 2-with-next, Case 3)
  alreadyDone: boolean,                     // true only for Case 0 — completed/started are both null when this is true
}
```

`completed`/`started` use the same `serializeLog` shape as `start-timer`'s response. Either (or, in Case 0, both) can be `null` — e.g. Case 2 with no next item in the group has `completed` populated and `started: null`.

### Relationship to `start-timer`

**`trigger-habit` supersedes `start-timer` for the tap-driven use case.** `start-timer` is a one-way "always start, never complete" primitive — fine for a Shortcut that means only "begin this," but wrong for an NFC tag meant to be tapped repeatedly through a routine, since it never completes the item you're walking away from on its own (that still relies on the general single-active-timer sweep completing it only once you start something *else*, not when you re-tap the same tag). A single NFC tag pointed at `trigger-habit` handles the full start → complete → advance cycle with one action, so **new Shortcuts should be built against `trigger-habit`, not `start-timer`**. `start-timer` isn't removed — it's kept as the lower-level "cold start" primitive `trigger-habit` builds on top of (both ultimately call `startInProgressLog`/`startImmediateLog`), and remains valid for a caller that genuinely only ever wants to start, never complete.

## Consumed by

[`features/timer.md`](../features/timer.md) (the resume-into-session behavior) and, indirectly, [`features/routines.md`](../features/routines.md) (where the item/group IDs this endpoint needs are surfaced for copying).

`trigger-habit`'s toggle logic (`toggleRoutineItemLog`) is also called directly by the NFC resolve page — see [`nfc-api.md`](nfc-api.md) and [`features/nfc.md`](../features/nfc.md).
