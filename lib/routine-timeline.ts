import type { ItemProjection } from "./projected-finish";

// Turns the same per-item projection data behind the live "projected
// finish" line (lib/projected-finish.ts) into a proportional horizontal
// timeline — one segment per item, width = share of the group's *current*
// total, not a fixed original total. See "Live routine timeline" in
// docs/features/timer.md.

export type TimelineColorState = "done" | "active" | "active-over" | "pending";

export interface TimelineSegment {
  id: string;
  minutes: number; // this segment's current width, in minutes
  pct: number;      // 0-100, share of totalMinutes below
  colorState: TimelineColorState;
}

export interface Timeline {
  segments: TimelineSegment[]; // in item order; zero-width (missed/rest) items are omitted
  totalMinutes: number;
  // Reconstructed real start instant (ms since epoch) — "now" minus every
  // done item's real actualMinutes and the active item's real elapsed so
  // far. Deliberately excludes pending items' projected time (they haven't
  // happened) and any paused/idle time (same simplification Story 3's
  // RoutineSession.totalActualMinutes already makes — see routines-api.md).
  startInstant: number;
}

export function computeTimeline(
  items: Array<{ id: string } & ItemProjection>,
  nowMs: number = Date.now()
): Timeline {
  let doneMinutes = 0;
  let activeElapsedMinutes = 0;

  const raw = items.map((item) => {
    if (item.state === "done") {
      const minutes = item.actualMinutes ?? item.projectedMinutes;
      doneMinutes += minutes;
      return { id: item.id, minutes, colorState: "done" as TimelineColorState };
    }
    if (item.state === "active") {
      // Elapsed-so-far derived from the same targetInstant anchor
      // projected-finish.ts uses, not a separately-passed elapsed value —
      // one source of truth for "how far into this item are we really."
      const elapsed =
        item.targetInstant != null
          ? Math.max(0, (nowMs - (item.targetInstant - item.projectedMinutes * 60000)) / 60000)
          : 0;
      activeElapsedMinutes = elapsed;
      // Normally exactly its target (the segment's "planned" width) — grows
      // past that the moment it runs over, which is what visibly eats into
      // the other segments' share of the bar as the minutes tick by.
      const minutes = Math.max(item.projectedMinutes, elapsed);
      return {
        id: item.id,
        minutes,
        colorState: (minutes > item.projectedMinutes ? "active-over" : "active") as TimelineColorState,
      };
    }
    if (item.state === "pending") {
      return { id: item.id, minutes: item.projectedMinutes, colorState: "pending" as TimelineColorState };
    }
    // missed / rest — zero width, same "contributes nothing" treatment as
    // remainingMinutes in projected-finish.ts.
    return { id: item.id, minutes: 0, colorState: "pending" as TimelineColorState };
  });

  const totalMinutes = raw.reduce((sum, seg) => sum + seg.minutes, 0);
  const segments: TimelineSegment[] = raw
    .filter((seg) => seg.minutes > 0)
    .map((seg) => ({ ...seg, pct: totalMinutes > 0 ? (seg.minutes / totalMinutes) * 100 : 0 }));

  const startInstant = nowMs - (doneMinutes + activeElapsedMinutes) * 60000;

  return { segments, totalMinutes, startInstant };
}
