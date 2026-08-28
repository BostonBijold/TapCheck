// Pure math behind TaskListSessionView's live "projected finish time"
// display — see docs/features/timer.md. Kept separate from the component so
// the four-state contribution logic (done/missed-rest/active/pending) is
// testable in isolation, the same way lib/task-progress.ts separates
// weekly-progress math from the components that render it.

export type TaskProjectionState = "done" | "missed" | "rest" | "active" | "pending";

export interface TaskProjection {
  projectedMinutes: number;
  state: TaskProjectionState;
  // Only meaningful when state === "active": the absolute instant (ms since
  // epoch) at which this task is expected to hit its own projectedMinutes
  // target, computed ONCE from its real start time (adjusted for any banked
  // pause time) — not re-derived from "now minus elapsed" on every tick.
  //
  // This matters: while the active task is still within its target, the
  // projected finish should be pinned to a fixed clock time and not visibly
  // move at all — you should only see it change if you finish early or run
  // over. Computing the active task's remaining time as "projectedMinutes -
  // elapsedSoFar" and adding that to a freshly-read "now" every render
  // happens to cancel out to the same fixed value algebraically, but it's
  // two independently-ticking numbers that only cancel because they were
  // both just sampled from Date.now() a few milliseconds apart — a fragile
  // coincidence, not a guarantee, and it invites rounding drift right at
  // display boundaries. Anchoring to a target instant computed once (and
  // only recomputed when the task's start/pause state actually changes,
  // not on every tick) makes the freeze exact instead of approximate.
  targetInstant?: number;
  // Only meaningful when state === "done": the task's real logged minutes.
  // Unused by remainingMinutes/projectedFinishTime below (a done task
  // contributes 0 either way, see the comment on remainingMinutes) — carried
  // here purely so lib/task-timeline.ts can build the timeline
  // visualization from this same per-task resolution instead of a second,
  // separately-maintained one.
  actualMinutes?: number;
}

// Total minutes of real work still standing between "now" (nowMs) and the
// list being finished.
//
// Done/missed/rest tasks contribute nothing further: their time already
// happened, and that's already reflected in wherever "now" currently sits.
// Adding their actualMinutes on top of "now" a second time would double-
// count it and push the projection later with every task you finish —
// defeating the point of a projection anchored live to the current moment
// (see "Anchor point" in timer.md: if the user started late, that lateness
// is already baked into "now", not something this math needs to re-derive
// from a session start timestamp).
//
// The active task contributes exactly the time left until its own
// targetInstant, for as long as "now" hasn't reached it yet — a fixed
// quantity that doesn't change tick to tick. The instant "now" reaches (or
// passes) targetInstant, it contributes nothing further: from that point on
// the projection tracks "now" directly, one tick at a time, which is what
// makes it visibly push later for every second you run over. Every other
// pending task (not yet reached, no log at all) contributes its full
// projectedMinutes, untouched.
export function remainingMinutes(items: TaskProjection[], nowMs: number = Date.now()): number {
  return items.reduce((total, item) => {
    if (item.state === "active") {
      if (item.targetInstant != null && nowMs < item.targetInstant) {
        return total + (item.targetInstant - nowMs) / 60000;
      }
      return total; // already at/over its own target
    }
    if (item.state === "pending") {
      return total + item.projectedMinutes;
    }
    return total; // done / missed / rest — already spent or zeroed out
  }, 0);
}

// The live projection itself — now + remainingMinutes. Recompute this on
// every tick alongside the session's own elapsed-time recompute() so it
// never drifts out of sync with the per-task display it sits next to.
export function projectedFinishTime(items: TaskProjection[], now: Date = new Date()): Date {
  const nowMs = now.getTime();
  return new Date(nowMs + remainingMinutes(items, nowMs) * 60000);
}

// Static "on-schedule" baseline — what time the list was expected to finish
// if everything ran exactly to plan (startTime + total projected minutes
// across the list). Used only for the optional on-track/behind indicator,
// never for the live projection above — comparing the two is what tells you
// whether you're ahead or behind, not what the live number itself is.
// Returns null when the list has no startTime (e.g. custom lists, which
// never auto-collapse and don't carry one).
export function staticBaselineFinish(
  today: string, // YYYY-MM-DD, local
  startTime: string | null,
  totalProjectedMinutes: number
): Date | null {
  if (!startTime) return null;
  const [h, m] = startTime.split(":").map(Number);
  const base = new Date(`${today}T00:00:00`);
  base.setHours(h, m + totalProjectedMinutes, 0, 0);
  return base;
}
