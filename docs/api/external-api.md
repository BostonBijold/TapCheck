> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# External API

A separate, API-key-authenticated surface for triggering the app from outside a browser session — built for the native App Intents "Trigger Habit" action (Siri/Shortcuts/Spotlight, see [`features/app-intents.md`](../features/app-intents.md)), but not tied to that specifically. Deliberately kept apart from [task-lists-api.md](task-lists-api.md)'s session-authenticated endpoints, which are shaped for the app's own client, not a third-party caller.

> **Vocabulary note**: the rest of this codebase was renamed from "Routine"/"Habit" to "TaskList"/"Task" — see CLAUDE.md's Vocabulary section — but this surface's request/response field names (`routineItemId`, `routineGroupId`) were deliberately left as-is so an already-configured Shortcut doesn't need its fields edited, only its URL. Internally, those values map onto this app's `Task`/`TaskList` concepts the moment they're parsed.

## Auth

Every request must include a valid API key, checked against `User.apiKey` (`models/User.ts`) via `findSessionByApiKey` in `lib/api-key.ts` — this is how the request's `userId`/`companyId` are determined; there is no session/cookie involved at all. The key can be supplied any of three ways, and all three are equivalent:

- Header: `x-api-key: <key>`
- Query param: `?apiKey=<key>`
- JSON body field: `{ "apiKey": "<key>" }`

Missing key → `401 { error: "Missing API key" }`. Key that doesn't match any user → `401 { error: "Invalid API key" }`. Key resolves to a user with no `companyId` attached yet → `403 { error: "No company assigned" }`.

### `GET /api/user/api-key`
Session-authenticated (normal app auth, not the API key itself) — this is how the app displays the key to the user, not how external callers authenticate. Returns `{ apiKey: string }`, generating and persisting one via `getOrCreateApiKey` on the user's first request if they don't have one yet ("generated once" — never rotates an existing key automatically). Format: `boak_<48 hex chars>`.

Displayed on the Profile page (`components/ProfileView.tsx`) with a copy-to-clipboard button, for pasting into a Shortcut.

> **Dev-mode caveat**: `SKIP_AUTH`'s local dev user (`dev-local-user`) isn't a real Mongo `User` document (no adapter-driven sign-in ever created one), so it can't hold a persisted key. `getOrCreateApiKey` falls back to a deterministic, unpersisted key, `boak_dev_<userId>`, recognized as a special case by `findSessionByApiKey` (which resolves it to `dev-local-company`, the same `SKIP_AUTH` fixture company every other dev-mode route uses) — this only exists so the external endpoint is testable locally without touching the database; it's meaningless in production.

## `POST /api/external/start-timer`

Starts a timer exactly like the in-app standalone "Start Timer" action, by delegating to the same `startInProgressLog` helper described in [task-lists-api.md](task-lists-api.md#task-logs) — the single-active-timer invariant (auto-**completing** whatever else this same person had running, not pausing it — that softer behavior is specific to navigating inside an already-open `TaskListSessionView`, see below) applies identically here, not as a separate reimplementation. If this same task was left `paused` by an in-app session earlier, starting it here resumes it — its banked `pausedSeconds` carry forward rather than resetting to zero.

Params (accepted via JSON body or query string, body takes precedence when both are present):

| Param | Required | Meaning |
|---|---|---|
| `routineItemId` | yes | Raw Mongo `_id` of the `Task` to start. Displayed read-only (`select-all`, no copy button) on that task's inline edit panel in `components/TaskListEditView.tsx`. |
| `routineGroupId` | no | Raw Mongo `_id` of the `TaskList` the task belongs to. Displayed read-only the same way on the list's edit page. If given, the task must actually belong to that list (validated — see below). |
| `date` | no | `YYYY-MM-DD`. Defaults to **server UTC date** (`new Date().toISOString().split("T")[0]`) — there's no client to supply a local timezone for an out-of-band caller; can matter near midnight. |

Validation, in order: task must exist and belong to this company (`404` otherwise); if `routineGroupId` given, that list must exist and belong to this company (`404`), and the task's `taskListId` must match it exactly (`400 "Task does not belong to that task list"` otherwise). Malformed ids (not valid ObjectId strings) return `400`, not a 500.

Notably, this validation doesn't check `timeOfDay` — a `routineGroupId` pointing at an anytime list (see [anytime-tasks.md](../features/anytime-tasks.md)) is accepted the same as any other list. The in-app "Start Tasks" button is deliberately hidden for anytime lists, so a session-anchored resume for one is currently only reachable through this endpoint, not through any in-app flow.

Effect:
- **`routineItemId` only** — starts that task's timer, `sessionTaskListId: null`. Identical outcome to tapping "Start Timer" in the app.
- **`routineItemId` + `routineGroupId`** — same timer start, plus `sessionTaskListId` is set on the log. The next time the app is opened (or the FAB's resume indicator is tapped — see [timer.md](../features/timer.md)), `TasksView.openInProgressTimer` sees the `sessionTaskListId`, resolves the list and the task's index within it, and opens `TaskListSessionView` directly at that task — mid-timer — instead of the plain Tasks home or the standalone timer screen.

Response: `{ ok: true, log: <serialized TaskLog> }` (same `serializeLog` shape used throughout task-lists-api.md, including `sessionTaskListId` and `pausedSeconds`).

### Interaction with a resumed session's own navigation

Once inside a session opened this way, moving between tasks *inside that session* (advancing via Done/Missed/Rest, or tapping another row to jump) no longer goes through this endpoint's sweep-to-done behavior — it uses `switchActiveLog` instead (see [timer.md](../features/timer.md#single-active-timer-pause-instead-of-complete-or-run-concurrently)), which **pauses** whatever was running rather than completing it. Only a genuinely external event completes something out from under the session: if a *second* call to this endpoint starts a different task (with or without `routineGroupId`) while the session is open, that still goes through `startInProgressLog`'s full sweep and auto-completes whatever the session currently has active for that same person — the session's foreground-revalidation effect (timer.md) detects this and adopts the real server result rather than fighting it. A task the session itself navigated away from, with no external call involved, is only ever `paused`, not completed, and stays resumable — either by jumping back to it in the same session, or by hitting this endpoint again for that exact `routineItemId`.

`TaskListSessionView.advance()` re-fetches the day's logs from the server on every step and only treats `done`/`missed`/`rest` as "handled" — an `in_progress` or `paused` task (from any source) becomes current instead of being skipped, and the search wraps back to the start of the task list rather than ending the session just because it reached the end, so a paused or never-visited task is never silently left behind. This is a live server check every time, not a snapshot taken when the session opened, specifically so a concurrent external trigger for a different task in the same list is picked up correctly.

## `POST /api/external/trigger-task`

A single, bidirectional endpoint for the native "Trigger Habit" App Intent: the same call either **starts** or **completes** a task, decided entirely by current server state (is there an active timer for this specific person, and does it match the triggered task) — never by a param the caller sends. This is what makes one action workable for a whole task list: run it once to start the first task, run it again to both finish that task and start the next, and so on.

The three-case dispatch below lives in `triggerTask()` (`lib/task-trigger.ts`), not inline in this route. This route stays a thin wrapper: auth + param parsing + ownership checks, then a call into the shared function.

Same auth as `start-timer` (see [Auth](#auth) above). Params, also accepted via JSON body or query string (body takes precedence):

| Param | Required | Meaning |
|---|---|---|
| `routineItemId` | yes | Raw Mongo `_id` of the `Task` being tapped. |
| `routineGroupId` | no | Raw Mongo `_id` of the `TaskList` the task belongs to. If given, the task must belong to that list — same validation as `start-timer` (`400 "Task does not belong to that task list"` otherwise). Also what drives auto-advance in Case 2 below. |
| `date` | no | `YYYY-MM-DD`. Defaults to server UTC date, same caveat as `start-timer`. |
| `source` | no | Opaque marker, currently only `"app_intent"` is meaningful. When present with that value, upserts an `AppIntentLink` (`models/AppIntentLink.ts`) recording `{ userId, taskId, lastTriggeredAt }` — see [`features/app-intents.md`](../features/app-intents.md#connection-status-in-manage-habit). Purely additive bookkeeping; never affects the trigger dispatch itself and never fails the request. |

Validation is identical to `start-timer`, in the same order: task must exist and belong to this company (`404`); if `routineGroupId` given, list must exist and belong to this company (`404`) and the task's `taskListId` must match it (`400`); malformed ObjectId strings return `400`, not a 500.

### Behavior — three cases

Which case applies is determined by looking up this specific person's single active (`in_progress`) log, if any, and comparing its `taskId` to the tapped one:

**Case 1 — no active log exists anywhere for this person.** Starts the tapped task:
- `standard`/`stopwatch` tasks → `startInProgressLog` (identical to `start-timer`'s own effect, including `sessionTaskListId` anchoring if `routineGroupId` was passed).
- `checkbox`, `form` (anything with no timer, per `isTimerTask` in `lib/task-trigger.ts`) → `startImmediateLog` writes a terminal `done` log immediately, `actualMinutes: 0` — it never passes through `in_progress` at all.

> ⚠️ **Known gap for `form` tasks**: since it's the app's primary task type (see `CLAUDE.md`) but isn't a timer task, triggering a form task via this endpoint (Siri/Shortcuts/NFC) instant-completes it with `formData: null` — there's no way for an out-of-band caller to supply field readings, so a temperature check "done" this way records no temperature. Building a real "trigger opens the app to fill in the task" flow is unscheduled future work, not a bug in the dispatch logic above — flagging so it's a conscious, known limitation.

Both halves call through `completeStrayInProgressLogs` first regardless (unconditional server-side enforcement of the single-active-timer invariant, not trusted to the caller) — in Case 1 that's a no-op since we already know nothing's active, but it's the same code path Cases 2 and 3 rely on.

**Case 2 — the tapped task IS the currently active one.** Completes it via `completeInProgressLog` (`state: "done"`, `actualMinutes` derived from `startedAt` + banked `pausedSeconds`, same math as `PATCH /api/task-logs`'s timer-completion branch — see [task-lists-api.md](task-lists-api.md#task-logs)). If `routineGroupId` was supplied, resolves the next not-yet-logged task in that list's `order` via `findNextTaskInList` and starts it exactly per Case 1's rules; if there's no next task, or `routineGroupId` was omitted, completion is all that happens.

**Case 3 — a different task is active.** Completes whatever *was* active (same as Case 2's completion, using that log's own `date`, not necessarily the request's `date`), then starts the tapped task per Case 1's rules — regardless of whether `routineGroupId` was supplied on this call. This is the jump case: the user lands on whichever task they tapped, not the next one in sequence.

All three cases use the sweep-to-**complete** pattern (`startInProgressLog` / `startImmediateLog` / `completeInProgressLog`), never `switchActiveLog`'s pause-and-resume pattern — every transition through this endpoint is terminal for the task being left behind. `switchActiveLog` remains reserved for in-session navigation inside an already-open `TaskListSessionView` (see the Interaction section above); this endpoint doesn't touch it.

### Response

```ts
{
  ok: true,
  completed: SerializedTaskLog | null,   // task just completed, if any (Case 2/3)
  started: SerializedTaskLog | null,     // task just started, if any (Case 1, Case 2-with-next, Case 3)
}
```

Both use the same `serializeLog` shape as `start-timer`'s response. Either can be `null` — e.g. Case 2 with no next task in the list has `completed` populated and `started: null`.

### Relationship to `start-timer`

**`trigger-task` supersedes `start-timer` for the repeat-trigger use case.** `start-timer` is a one-way "always start, never complete" primitive — fine for a caller that means only "begin this," but wrong for something meant to be run repeatedly through a task list, since it never completes the task you're walking away from on its own (that still relies on the general single-active-timer sweep completing it only once you start something *else*, not when you re-run against the same task). A single action pointed at `trigger-task` handles the full start → complete → advance cycle in one call, which is exactly what the "Trigger Habit" App Intent (see [`features/app-intents.md`](../features/app-intents.md)) is built against. `start-timer` isn't removed — it's kept as the lower-level "cold start" primitive `trigger-task` builds on top of (both ultimately call `startInProgressLog`/`startImmediateLog`), and remains valid for a caller that genuinely only ever wants to start, never complete.

## `POST /api/external/complete-active-task`

Same auth as every other route on this surface (see [Auth](#auth) above). **No `routineItemId` param at all** — completes whichever `TaskLog` the server finds `in_progress` for this specific person (server-authoritative, via the single-active-timer invariant — at most one ever exists per person), and if that log carries a `sessionTaskListId`, auto-starts the next not-yet-logged task in that list via `findNextTaskInList`, exactly like `trigger-task`'s Case 2. A no-op (`{ completed: null, started: null }`) if nothing is currently active.

Built specifically for the Live Activity's "Done" button (`CompleteHabitFromActivityIntent.swift`, [`features/live-activity.md`](../features/live-activity.md)), which — unlike `TriggerHabitIntent`'s Shortcuts picker, which always knows its target task by construction — can't reliably determine which task is current from its own side: a button's bound intent parameters go stale if the Lock Screen doesn't get a chance to redraw between two taps, and reading `Activity.activities` fresh from within the intent's `perform()` was observed unreliable/empty on-device. Letting the server resolve "which task" itself, the same way the single-active-timer invariant already resolves it everywhere else in this app, sidesteps needing the native side to track that at all.

Response: `{ ok: true, completed: SerializedTaskLog | null, started: SerializedTaskLog | null }` — same shape as `trigger-task`.

## `GET /api/external/nfc/[tagCode]`

The Shortcuts-driven silent-trigger entry point for the NFC feature — see [`features/nfc.md`](../features/nfc.md) for the full picture (linking flow, Universal Links, Shortcut/Automation setup). Same auth as every other route on this surface (see [Auth](#auth) above); since it's a GET fired by Shortcuts' "Get Contents of URL" with no body, the API key only ever arrives via the `x-api-key` header or `?apiKey=` query string, never a JSON body field.

Unlike `trigger-task` (caller supplies `routineItemId` directly), this route takes no task param at all — `tagCode` is a URL path segment, resolved to a `taskId` server-side on every call via the `NfcTag` collection, so relinking a tag to a different task in-app takes effect on the very next tap with zero Shortcut/Automation changes. A tag with no company yet (`companyId: null`) auto-claims against a fresh `PendingNfcLink` for the calling user, exactly like the in-app "arm, then tap" flow — if no pending link is armed (or it's gone stale, >5 minutes old), the response is `422 { error: "Tag is not linked to a task yet — link it in the app first" }`. A tag claimed by a *different* company returns the same generic `404 { error: "Tag not found" }` as a nonexistent tag — ownership is never revealed.

Once resolved, this calls the same `triggerTask()` (`lib/task-trigger.ts`) as `trigger-task` and `complete-active-task` above, so the response shape is identical: `{ ok: true, completed: SerializedTaskLog | null, started: SerializedTaskLog | null }`.

## `GET /api/external/tasks`

A read-only sibling to the two trigger endpoints — lists the caller's company's active tasks, with each task carrying its own list context inline, rather than the nested-list-array shape `GET /api/task-lists` (the session-authenticated, in-app equivalent) uses. Built for the native App Intents `HabitEntityQuery` (`ios/App/App/AppIntents/HabitEntityQuery.swift`) to back a live Shortcuts/Siri picker — see [`features/app-intents.md`](../features/app-intents.md). No Shortcut or URL-based flow calls this directly.

Same three-way auth as every other route (see [Auth](#auth) above); since it's a GET, the API key in practice arrives via the query string or `x-api-key` header, never a body field.

No params beyond the API key.

### Response

```ts
{
  ok: true,
  habits: [
    {
      id: string,          // Task._id
      name: string,
      icon: string,
      itemType: TaskType,
      groupId: string,     // TaskList._id
      groupName: string,
    },
    ...
  ]
}
```

The `habits`/`itemType`/`groupId`/`groupName` field names in this response are kept as-is for the same reason as the request params above — this is part of the same external wire contract. Sorted by list order, then task order within each list — matching the order the task appears in-app. Not filtered by `scheduledDays`: this is a general "which task" picker for voice/automation use at arbitrary times, not a "what's due today" view, consistent with `trigger-task` itself never checking `scheduledDays` either. No rate limiting or caching, same as every other route on this surface.

## Consumed by

[`features/timer.md`](../features/timer.md) (the resume-into-session behavior) and, indirectly, [`features/task-lists.md`](../features/task-lists.md) (where the task/list IDs this endpoint needs are surfaced for copying). `trigger-task` specifically is also called by the Live Activity's "Done" button (`CompleteHabitFromActivityIntent`, `source: "live_activity"`) — see [`features/live-activity.md`](../features/live-activity.md).
