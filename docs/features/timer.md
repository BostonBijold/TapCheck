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

## Dragging the ring to set elapsed time

The whole icon/name/ring area of the running screen is a drag surface — not just the ring itself, which is too thin and small a target to grab reliably. Touch or click down anywhere in that area (excluding the top bar and the buttons below) and drag around in a circle like a rotary dial to set elapsed time directly, with a small handle dot always sitting at the current arc tip as a visual affordance for what you're winding. The wrapping `<div>` owns the gesture (`touch-action: none`, `select-none`, `pointer-events-none` on everything inside it) so the ring, icon, and text are purely decorative and never intercept the drag — this also avoids SVG's `pointer-events: stroke`, which has inconsistent browser support and was the original (buggy) approach.

One full clockwise lap adds one "revolution" of time: for a countdown item, that's `projectedMinutes` (so two laps sets 40 minutes over a 20-minute target); for a stopwatch item (no target), it's a fixed 30 minutes, matching the ring-fill soft cap that mode already uses visually. Dragging counter-clockwise back past the start clamps at 0 — it can't go negative. There's no upper clamp; winding multiple laps over target is the point, and the existing burgundy "over target" ring color/styling already covers that case.

The gesture logic lives in `lib/useRingDrag.ts` — a small hook, not a shared visual component, since `TimerScreen` and `RoutineSession` each render their own ring markup independently and only the pointer/angle math is common; `svgRef` (for the angle math's center point) and the pointer `handlers` (attached to the big wrapping `div`, not the SVG) are deliberately decoupled. It converts pointer position to "angle from 12 o'clock, clockwise" using the ring SVG's own bounding-box center (compensating for its `-rotate-90` CSS class), then tracks an **unwrapped, accumulating** angle across pointer-move events (via shortest-signed-delta, not the raw `[0, 2π)` value) so multi-lap winding and unwinding both work instead of the angle jumping at the 0/2π seam. `onPointerDown`/`onPointerMove` call `preventDefault()` so the browser's own drag/text-selection gesture never competes with it.

Dragging never changes whether the timer is running — it only ever moves the `elapsed` value. Both files' `recompute()` (the wall-clock tick, see above) no-ops while a drag is in progress via an `isDraggingRef` guard, so the two don't fight over `elapsed`. On every drag update, `baseElapsedRef` is set to the dragged value and, **only if `runStartRef` was already non-null** (i.e. the timer was actively running when the drag started), it's reanchored to `Date.now()`. That single conditional is the entire mechanism: if it was running, the existing tick naturally continues from the dragged value the instant you let go, with no jump; if it was paused, `runStartRef` stays `null` throughout and nothing ticks after release — it just sits at wherever you left it.

## Countdown vs. stopwatch mode

- **Countdown** (`itemType !== "stopwatch"`): counts down from `projectedMinutes`. Ring color: **olive** from 0–74% of target, **amber** from 75–99%, **burgundy** once elapsed ≥ target — at which point the display flips to counting *up* past the target as `+MM:SS`.
- **Stopwatch** (`itemType === "stopwatch"`): no target, always counts up; the ring fills over a 30-minute soft cap and then stays full. Ring is always olive — there's no color-state logic in this mode.

"Done" computes `actualMinutes = max(1, round(elapsed / 60))` from the local wall-clock value and passes it to the parent; "Missed" passes nothing. Neither button makes an API call directly — `TimerScreen` itself is purely presentational and delegates persistence to callbacks from `RoutinesView`.

## Server-authoritative start time, and a single-active-timer invariant

`RoutinesView.handleStartTimer` does **not** just open the timer locally. On a fresh start it first `POST`s `{ state: "in_progress" }` to `/api/routine-logs`, which stamps `startedAt` server-side, *then* opens `TimerScreen` — so the source of truth for "when did this start" always lives on the server before the UI even appears. If the item already has an `in_progress` log (resuming), no new POST is made; elapsed time is simply recomputed locally from the existing `startedAt`.

The API enforces, server-side, that **at most one log can be `in_progress` at a time per user** (see routines-api.md) — any start of a timer first auto-completes any other dangling `in_progress` log it finds, crediting it with the elapsed time since its `startedAt`, rather than trusting the client to have closed it out. This is a single shared function (`startInProgressLog` in `lib/routine-log-actions.ts`), not duplicated logic, so it applies identically whether the timer was started by tapping inside the app, from within a Routine Session (below), or via [external-api.md](../api/external-api.md)'s `POST /api/external/start-timer` (an API-key-authenticated endpoint meant for things like an iPhone Shortcut fired by an NFC tag). `handleStartTimer` re-fetches the day's logs after posting so a stray item auto-resolved this way is reflected in the UI too, not just the item that was just started.

The external endpoint can optionally pass a `routineGroupId` alongside the item, which stamps `sessionGroupId` on the log (see routines-api.md's Routine Logs section). That single field is what lets a resume land the user inside a Routine Session instead of the standalone timer — see below.

On completion, `RoutinesView.handleTimerComplete` `PATCH`es `{ state: "done", actualMinutes }` — but the server derives `actualMinutes` itself from `now - startedAt` when a `startedAt` exists (see routines-api.md); the client-sent value is only a fallback for the edge case where no `startedAt` is on record.

## Resuming after a reload or app close

Because `startedAt` is already persisted before the timer UI opens, closing the tab/app entirely and reopening it does not lose progress: `RoutinesView` has a mount-time effect that scans the day's logs for one with `state === "in_progress"` and a `startedAt`, computes elapsed as `Date.now() - startedAt`, and reopens `TimerScreen` automatically with that seeded value — reproducing the exact resume behavior of manually tapping "Resume Timer" on an in-progress row. Since the single-active-timer invariant above guarantees at most one `in_progress` log exists at any time, this scan is never ambiguous about which item to reopen.

This shared lookup — `RoutinesView.openInProgressTimer()` — is also what the FAB's resume tap (`?resumeTimer=1`, see below) and manually tapping "Resume Timer" on a row (`handleStartTimer`'s resume branch) both call, so all three entry points branch the same way: if the in-progress log's `sessionGroupId` is set, it resolves that group and the item's index within it and opens `RoutineSession` there instead — reproducing "tapped Start Routine and navigated to that item by hand," per [external-api.md](../api/external-api.md). If the group or item can't be resolved (e.g. the group was deleted since), it falls back to the standalone timer rather than failing silently. With no `sessionGroupId` (the ordinary case — tapping Start Timer in the app never sets one), it's always the standalone `TimerScreen`, and completing or missing it just closes the timer screen and returns to the plain Routines home, with nothing else active.

The FAB (`components/BottomNav.tsx`) surfaces whichever timer is active app-wide, with a live clock, and its resume tap navigates to `/routines?resumeTimer=1&date=…`, which `RoutinesView` reads via a dedicated (non-mount-only) effect so it works even if the Routines page was already mounted.

## The sequential session (`RoutineSession.tsx`)

`RoutineSession` steps through a group's items, but only one item's timer is ever actually running at a time — including across jumps. `startIndex` — which item it opens on — comes from wherever it was opened: manually tapping "Start Routine" computes the group's first not-yet-`done` item; resuming a `sessionGroupId`-anchored log (see above) instead lands on whichever specific item the anchor points at, regardless of whether earlier items in the group are complete.

### Single active timer, pause instead of complete or run concurrently

`RoutineLog` has a `paused` state (distinct from `in_progress`) and a `pausedSeconds` field banking elapsed time from earlier running segments. Whenever the current item changes — advancing, or tapping a row to jump — an effect keyed on the current index calls `switchActiveLog` (`lib/routine-log-actions.ts`, via `POST /api/routine-logs` with `sessionNav: true`): whatever was `in_progress` gets flipped to `paused` (elapsed banked, `startedAt` cleared), and the new current item is stamped `in_progress` — resuming from its own banked `pausedSeconds` if it was paused earlier, or starting fresh otherwise. Nothing here ever sets a terminal state (`done`/`missed`/`rest`) — jumping away from an item never marks it done or missed, only Done/Missed/Rest (app button or the external API) does that. This is deliberately different from `startInProgressLog` (used by the standalone timer and the external API), which still auto-*completes* whatever else is `in_progress` — moving your attention to a different item inside an already-open session isn't the same signal as "I've started doing something else in real life."

Checkbox items are skipped entirely (no timer to track), but still trigger the same switch-and-pause call so whatever else was running gets paused while you're on them. This per-item call always passes `sessionGroupId`, so closing the app mid-session (without tapping X) resumes straight back into the session on reopen, not the standalone timer.

Tapping Done/Missed/Rest calls `advance()`, which `POST`s a terminal-state log for the current item, then **re-fetches the day's logs from the server** and moves to the next item that isn't `done`/`missed`/`rest` — `paused` and `in_progress` items are deliberately not treated as "handled." That search (`nextUnfinishedIndex`) walks forward from the current index first, then **wraps back to the start of the list** rather than stopping at the end — so an earlier item left `paused` (jumped away from) or never touched (jumped over) still gets revisited instead of the session silently reaching the summary screen while it's still outstanding. The summary phase is only reached once every item in the group is truly finished. The same wrap-around search is used by the foreground-revalidation effect below.

A separate `visibilitychange`/`focus` effect re-fetches the day's logs and checks whether the current item's log is still `in_progress` or `paused` (i.e. still legitimately "ours" or otherwise unresolved) — if it's now a terminal state instead, something outside this session completed it (an external trigger, another tab/device), so the session adopts that real result and advances via the same wrap-around search rather than trusting a stale local clock.

Tapping X to close the session mid-item flushes that item's progress instead of discarding it: `handleClose` `PATCH`es `{ state: "done", actualMinutes }` (computed from the session's local elapsed clock, which is already seeded from server-recorded `startedAt` + `pausedSeconds`) before calling the parent's close handler. Any *other* item left `paused` when you close is not touched — it stays `paused`, resumable later either by reopening this session or by tapping its row on the main Routines list (which detects `paused` the same way it detects `in_progress` and offers "Resume Timer," reopening the session at that item). Closing via X and reaching the end via "Finish" both then trigger the same parent handler (`RoutinesView.handleSessionFinish`), which re-fetches the day's logs and calls `router.refresh()` to resync the UI.

### Future direction: a persistent session record

Today "a routine session" isn't its own stored entity — it's reconstructed on every read by joining today's `RoutineLog` rows on `sessionGroupId` + date (`fetchDayLogs()` in `RoutineSession.tsx`). That's sufficient for the current UI, but two things it can't do well: give a session its own true wall-clock start-to-finish duration (today's "actual" total is sum-of-item-actuals, which deliberately excludes paused/idle time — a real design choice, not a gap), and record completion *order* durably enough to eventually power a recommendation like "you usually do 1, 2, 4, 5, 3." Order is genuinely ambiguous to reconstruct after the fact once pause/resume exists (a paused-then-resumed item has multiple time segments). If/when that kind of session-level analytics gets built, a dedicated `RoutineSession` model (start/finish timestamps, ordered completion sequence, status) would be the right foundation — but it's a separate initiative from the day-to-day timer mechanics described above, not something the current implementation needs.

## Files

- `components/TimerScreen.tsx` — standalone single-habit timer.
- `components/RoutineSession.tsx` — sequential multi-habit session: the pause/resume-on-jump effect, `advance()`, the foreground-revalidation effect, and the shared `nextUnfinishedIndex` wrap-around search.
- `components/RoutinesView.tsx` — `handleStartTimer`, `handleTimerComplete`, `handleTimerMissed`, `handleSessionFinish`, `openInProgressTimer`, and the effects that call it (mount-time auto-resume, and the `autoResumeTimer`/`?resumeTimer=1` effect for the FAB). `handleStartTimer` treats `paused` the same as `in_progress` for the purpose of resuming into a session.
- `components/BottomNav.tsx` — the FAB's active-timer indicator and resume tap; the elapsed display adds `pausedSeconds` on top of `now - startedAt`.
- `lib/routine-log-actions.ts` — `startInProgressLog` (sweep-to-done, used by the standalone timer and the external API) and `switchActiveLog` (pause-not-complete, used only by in-session navigation).
- `lib/useRingDrag.ts` — the drag-to-set-time gesture shared by both rings.

## Depends on

The routine-logs section of [`docs/api/routines-api.md`](../api/routines-api.md), and [`docs/api/external-api.md`](../api/external-api.md) for the API-key-triggered start path and session anchoring.
