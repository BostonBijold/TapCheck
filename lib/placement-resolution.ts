// The pure "most relevant placement" selection logic, deliberately isolated
// in its own module with zero imports (no Mongoose, no models) so it can be
// safely imported by CLIENT code (lib/offline-nfc-resolver.ts, used from
// components/BottomNav.tsx) as well as server code
// (lib/task-definitions.ts's resolveMostRelevantPlacement) without dragging
// the server-only DB layer into the client bundle — see
// docs/features/offline.md. Splitting this out of lib/task-definitions.ts
// (which imports mongoose/models at module scope) is what makes that
// possible: any client import of that file fails to build (Node builtins
// like 'net'/'tls' aren't available in a webpack client bundle).

export interface PlacementLike {
  id: string;
  taskListId: string;
  order: number;
}
export interface TaskListLike {
  id: string;
  order: number;
  startTime: string | null;
}
export interface TaskLogStateLike {
  taskId: string;
  state: string;
}

// Given a definition's placements, the task lists they belong to, and
// today's logs for those placements, picks whichever is "most relevant
// right now". Used by both a live Mongo read (resolveMostRelevantPlacement
// in lib/task-definitions.ts, online) and the offline SQLite cache
// (lib/offline-nfc-resolver.ts, no network) — the identical judgment call
// either way. Reasonable defaults, most-specific first:
//
//   1. Skip any placement already resolved today (done/missed/rest) — it
//      doesn't need attention right now.
//   2. Among what's left, prefer whichever list's startTime is closest to
//      nowMinutesLocal — the shift window we're nearest to.
//   3. Ties, or no placement has a startTime (anytime lists), fall back to
//      list order then placement order.
//   4. Nothing unresolved today (everything already logged) — same
//      fallback, so scanning a fully-done tag still opens something
//      sensible to review rather than erroring.
export function pickMostRelevantPlacement(
  placements: PlacementLike[],
  taskLists: TaskListLike[],
  logs: TaskLogStateLike[],
  nowMinutesLocal: number | null
): string | null {
  if (placements.length === 0) return null;
  if (placements.length === 1) return placements[0].id;

  const listById = new Map(taskLists.map((tl) => [tl.id, tl]));
  const logByTaskId = new Map(logs.map((l) => [l.taskId, l]));

  const sorted = [...placements].sort((a, b) => {
    const listA = listById.get(a.taskListId);
    const listB = listById.get(b.taskListId);
    return (listA?.order ?? 0) - (listB?.order ?? 0) || a.order - b.order;
  });

  const unresolved = sorted.filter((p) => {
    const log = logByTaskId.get(p.id);
    return !log || (log.state !== "done" && log.state !== "missed" && log.state !== "rest");
  });
  const candidates = unresolved.length > 0 ? unresolved : sorted;

  if (nowMinutesLocal == null) return candidates[0].id;

  let best = candidates[0];
  let bestDistance = Infinity;
  for (const p of candidates) {
    const startTime = listById.get(p.taskListId)?.startTime;
    if (!startTime) continue;
    const [h, m] = startTime.split(":").map(Number);
    const distance = Math.abs(h * 60 + m - nowMinutesLocal);
    if (distance < bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best.id;
}
