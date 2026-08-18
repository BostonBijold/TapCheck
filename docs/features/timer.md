> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Timer

There are two separate timer UIs, both driving the same underlying `RoutineLog` state machine (see [routines-api.md](../api/routines-api.md)):

- **`components/TimerScreen.tsx`** — a standalone, full-screen timer for a single habit, opened by tapping "Start Timer" anywhere in [routines.md](routines.md)/[habits.md](habits.md).
- **`components/RoutineSession.tsx`** — a sequential, full-screen flow that steps through every item in a group one at a time, opened via "Start Routine".

Both are orchestrated by `components/RoutinesView.tsx`.

## How elapsed time is computed

Neither timer counts `setInterval` ticks as the source of truth. Both use the same pattern: `baseElapsedRef` banks seconds accumulated before the current running segment, `runStartRef` holds `Date.now()` for when the current segment began (`null` if paused), and a `recompute()` function derives `elapsed = baseElapsedRef + (Date.now() - runStartRef)` from real timestamps. The `setInterval(recompute, 1000)` tick is purely cosmetic — even if it's throttled or suspended while the app is backgrounded, the next tick (or the resync below) recomputes the *true* elapsed time from wall-clock time, so no time is silently lost.

A separate effect listens for `visibilitychange`, `focus`, and `pageshow` and calls `recompute()` immediately on any of them, so the displayed time snaps to correct the instant the app returns to the foreground rather than waiting up to a second for the next tick.

Pause/Resume is purely local UI state (`isRunning`) — it makes no API call.

## Countdown vs. stopwatch mode

- **Countdown** (`itemType !== "stopwatch"`): counts down from `projectedMinutes`. Ring color: **olive** from 0–74% of target, **amber** from 75–99%, **burgundy** once elapsed ≥ target — at which point the display flips to counting *up* past the target as `+MM:SS`.
- **Stopwatch** (`itemType === "stopwatch"`): no target, always counts up; the ring fills over a 30-minute soft cap and then stays full. Ring is always olive — there's no color-state logic in this mode.

"Done" computes `actualMinutes = max(1, round(elapsed / 60))` from the local wall-clock value and passes it to the parent; "Missed" passes nothing. Neither button makes an API call directly — `TimerScreen` itself is purely presentational and delegates persistence to callbacks from `RoutinesView`.

## Server-authoritative start time, and a single-active-timer invariant

`RoutinesView.handleStartTimer` does **not** just open the timer locally. On a fresh start it first `POST`s `{ state: "in_progress" }` to `/api/routine-logs`, which stamps `startedAt` server-side, *then* opens `TimerScreen` — so the source of truth for "when did this start" always lives on the server before the UI even appears. If the item already has an `in_progress` log (resuming), no new POST is made; elapsed time is simply recomputed locally from the existing `startedAt`.

The API enforces, server-side, that **at most one log can be `in_progress` at a time per user** (see routines-api.md) — any `POST { state: "in_progress" }` first auto-completes any other dangling `in_progress` log it finds, crediting it with the elapsed time since its `startedAt`, rather than trusting the client to have closed it out. `handleStartTimer` re-fetches the day's logs after posting so a stray item auto-resolved this way is reflected in the UI too, not just the item that was just started.

On completion, `RoutinesView.handleTimerComplete` `PATCH`es `{ state: "done", actualMinutes }` — but the server derives `actualMinutes` itself from `now - startedAt` when a `startedAt` exists (see routines-api.md); the client-sent value is only a fallback for the edge case where no `startedAt` is on record.

## Resuming after a reload or app close

Because `startedAt` is already persisted before the timer UI opens, closing the tab/app entirely and reopening it does not lose progress: `RoutinesView` has a mount-time effect that scans the day's logs for one with `state === "in_progress"` and a `startedAt`, computes elapsed as `Date.now() - startedAt`, and reopens `TimerScreen` automatically with that seeded value — reproducing the exact resume behavior of manually tapping "Resume Timer" on an in-progress row. Since the single-active-timer invariant above guarantees at most one `in_progress` log exists at any time, this scan is never ambiguous about which item to reopen.

## The sequential session (`RoutineSession.tsx`)

`RoutineSession` advances through a group's items one at a time. Whenever a new item becomes current (session start, or after `advance()` moves the index forward), an effect keyed on the current index stamps a fresh `in_progress` record for it on the server (`startedAt = now`) *before* starting its clock locally — the same pattern `handleStartTimer` uses — unless that item already has an `in_progress` log from outside the session (started via the standalone timer before "Start Routine" was tapped), in which case it resumes from that existing `startedAt` instead of resetting it. Checkbox items are skipped entirely (no timer to track).

Tapping Done/Missed/Rest calls `advance()`, which `POST`s a terminal-state log for the current item and moves to the next one (or shows a summary screen once the last item is logged).

Tapping X to close the session mid-item now flushes that item's progress instead of discarding it: `handleClose` `PATCH`es `{ state: "done", actualMinutes }` (server-derived from the `startedAt` stamped when the item became current) before calling the parent's close handler. Items already completed earlier in the same session are unaffected (their logs were already POSTed by `advance()`). Closing via X and reaching the end via "Finish" both then trigger the same parent handler (`RoutinesView.handleSessionFinish`), which re-fetches the day's logs and calls `router.refresh()` to resync the UI.

## Files

- `components/TimerScreen.tsx` — standalone single-habit timer.
- `components/RoutineSession.tsx` — sequential multi-habit session.
- `components/RoutinesView.tsx` — `handleStartTimer`, `handleTimerComplete`, `handleTimerMissed`, `handleSessionFinish`, and the auto-resume-on-load effect.

## Depends on

The routine-logs section of [`docs/api/routines-api.md`](../api/routines-api.md) — this is the only API surface the timer feature touches.
