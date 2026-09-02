// Deliberately imports the pure selection logic from lib/placement-resolution.ts,
// NOT from lib/task-definitions.ts — that file imports Mongoose/models at
// module scope, which fails to build in a client bundle (this module is
// reached from components/BottomNav.tsx, a "use client" component). See
// lib/placement-resolution.ts's own header comment.
import { pickMostRelevantPlacement } from "./placement-resolution";
import { getTaskDefinitionsByNfcUid, getTaskLists, getTasksForDefinition, getTaskLogsForTaskIds } from "./offline-db";

// The offline equivalent of app/api/tasks/by-nfc-uid/route.ts's UID → task
// resolution, used when the FAB's "scan to open" shortcut
// (components/BottomNav.tsx) has a UID but no network — see
// docs/features/offline.md's "Offline NFC resolution". Only covers
// already-linked tags whose definition was present in the last successful
// pull sync; a tag linked on a different device since then won't resolve
// offline until the next pull (documented, acceptable gap — see the doc).
//
// Deliberately does NOT replicate app/api/tasks/by-nfc-uid's further
// resolveFabScanTarget step (the already-logged/anytime/session/locked
// four-way response split) — the doc only asks for
// resolveMostRelevantPlacement-equivalent behavior offline, not that
// finer-grained routing. Callers just open the resolved task directly.
//
// Also does NOT replicate the online route's multi-target disambiguation
// (see docs/features/nfc.md's "Multi-target binding") — a tag bound to more
// than one TaskDefinition just resolves to the first match below, silently,
// same as picking `definitions[0]` used to be the *only* possible outcome
// before that constraint was removed. A documented, accepted gap offline,
// same spirit as the other offline-mode simplifications in
// docs/features/offline.md — online scans always disambiguate correctly.
export async function resolveOfflineNfcUid(
  uid: string,
  localDate: string,
  nowMinutesLocal: number | null
): Promise<{ taskId: string; taskDefinitionId: string } | null> {
  const definitions = await getTaskDefinitionsByNfcUid(uid);
  // See the "Also does NOT replicate" note above — a tag can legitimately
  // resolve to more than one definition now; offline mode just takes the
  // first rather than disambiguating.
  const definition = definitions[0];
  if (!definition) return null;

  const placements = await getTasksForDefinition(definition.id);
  if (placements.length === 0) return null;
  if (placements.length === 1) return { taskId: placements[0].id, taskDefinitionId: definition.id };

  const companyTaskLists = await getTaskLists(definition.companyId);
  const taskListIds = new Set(placements.map((p) => p.taskListId));
  const relevantTaskLists = companyTaskLists.filter((tl) => taskListIds.has(tl.id));

  const logs = await getTaskLogsForTaskIds(
    placements.map((p) => p.id),
    localDate
  );

  const bestId = pickMostRelevantPlacement(
    placements.map((p) => ({ id: p.id, taskListId: p.taskListId, order: p.order })),
    relevantTaskLists.map((tl) => ({ id: tl.id, order: tl.order, startTime: tl.startTime })),
    logs.map((l) => ({ taskId: l.taskId, state: l.state })),
    nowMinutesLocal
  );

  return bestId ? { taskId: bestId, taskDefinitionId: definition.id } : null;
}
