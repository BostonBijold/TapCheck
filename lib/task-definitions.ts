import mongoose from "mongoose";
import TaskDefinition from "@/models/TaskDefinition";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";
import TaskLog from "@/models/TaskLog";
import type { TaskType, FormFieldDef } from "@/models/TaskDefinition";

// Joins a Task placement onto its TaskDefinition — see models/Task.ts and
// models/TaskDefinition.ts for the split. Every reader in the app that used
// to pull name/icon/taskType/formFields/nfcTagUid straight off a Task
// document now gets the identical flat shape back from here instead, with
// projectedMinutes resolved (the placement's own override, or the
// definition's default) — so nothing downstream of this (API response
// shapes, RowItem/TimerItem, StreakDots, analytics) needed to change at
// all, only where these fields are actually stored.

export interface ResolvedTaskFields {
  name: string;
  icon: string;
  taskType: TaskType;
  formFields: FormFieldDef[];
  nfcTagUid: string | null;
  templateId: string | null;
  projectedMinutes: number;
}

// Bare minimum shape resolveTasks needs from a lean Task doc — callers can
// pass richer lean docs through and keep every other field via the `T`
// generic (createdAt, _id, taskListId, etc. all pass through untouched).
interface LeanTaskLike {
  definitionId: mongoose.Types.ObjectId | string;
  projectedMinutes?: number | null;
}

const FALLBACK: ResolvedTaskFields = {
  name: "Deleted task",
  icon: "help-circle",
  taskType: "form",
  formFields: [],
  nfcTagUid: null,
  templateId: null,
  projectedMinutes: 0,
};

// Batch join — one query for every distinct definitionId referenced,
// regardless of how many placements share it. A placement whose definition
// can't be found (shouldn't happen under normal operation — deleting a
// definition is blocked while placements reference it, see
// app/api/task-definitions/[id]/route.ts — but defensive against a stray
// reference) falls back to a visible placeholder rather than throwing.
export async function resolveTasks<T extends LeanTaskLike>(tasks: T[]): Promise<Array<T & ResolvedTaskFields>> {
  const definitionIds = Array.from(new Set(tasks.map((t) => t.definitionId.toString())));
  const definitions = definitionIds.length > 0
    ? await TaskDefinition.find({ _id: { $in: definitionIds } }).lean()
    : [];
  const byId = new Map(definitions.map((d) => [d._id.toString(), d]));

  return tasks.map((t) => {
    const def = byId.get(t.definitionId.toString());
    return {
      ...t,
      name: def?.name ?? FALLBACK.name,
      icon: def?.icon ?? FALLBACK.icon,
      taskType: (def?.taskType as TaskType | undefined) ?? FALLBACK.taskType,
      formFields: def?.formFields ?? FALLBACK.formFields,
      nfcTagUid: def?.nfcTagUid ?? FALLBACK.nfcTagUid,
      templateId: def?.templateId ? def.templateId.toString() : FALLBACK.templateId,
      projectedMinutes: t.projectedMinutes ?? def?.projectedMinutes ?? FALLBACK.projectedMinutes,
    };
  });
}

export async function resolveTask<T extends LeanTaskLike>(task: T): Promise<T & ResolvedTaskFields> {
  const [resolved] = await resolveTasks([task]);
  return resolved;
}

// Resolves a scanned/bound TaskDefinition to whichever of its active
// placements is "most relevant right now" — needed because, unlike before
// the catalog split, one physical tag (bound at the definition level) can
// now back more than one list placement (e.g. the fridge-temp check placed
// in both the opening and closing lists). This is a documented judgment
// call, not a settled product spec (see the "Company Task Catalog" design's
// open question on this) — reasonable defaults, most-specific first:
//
//   1. Skip any placement already resolved today (done/missed/rest) — it
//      doesn't need attention right now.
//   2. Among what's left, prefer whichever list's startTime is closest to
//      localDate's current time-of-day — the shift window we're nearest to.
//   3. Ties, or no placement has a startTime (anytime lists), fall back to
//      list order then placement order.
//   4. Nothing unresolved today (everything already logged) — same
//      fallback, so scanning a fully-done tag still opens something
//      sensible to review rather than erroring.
export async function resolveMostRelevantPlacement(
  companyId: string,
  definitionId: string,
  localDate: string,
  nowMinutesLocal: number | null
): Promise<mongoose.Types.ObjectId | null> {
  const placements = await Task.find({ companyId, definitionId, isActive: true }).lean();
  if (placements.length === 0) return null;
  if (placements.length === 1) return placements[0]._id;

  const taskLists = await TaskList.find({
    _id: { $in: placements.map((p) => p.taskListId) },
    companyId,
  }).lean();
  const listById = new Map(taskLists.map((tl) => [tl._id.toString(), tl]));

  const logs = await TaskLog.find({
    companyId,
    date: localDate,
    taskId: { $in: placements.map((p) => p._id) },
  }).lean();
  const logByTaskId = new Map(logs.map((l) => [l.taskId.toString(), l]));

  const sorted = [...placements].sort((a, b) => {
    const listA = listById.get(a.taskListId.toString());
    const listB = listById.get(b.taskListId.toString());
    return (listA?.order ?? 0) - (listB?.order ?? 0) || a.order - b.order;
  });

  const unresolved = sorted.filter((p) => {
    const log = logByTaskId.get(p._id.toString());
    return !log || (log.state !== "done" && log.state !== "missed" && log.state !== "rest");
  });
  const candidates = unresolved.length > 0 ? unresolved : sorted;

  if (nowMinutesLocal == null) return candidates[0]._id;

  let best = candidates[0];
  let bestDistance = Infinity;
  for (const p of candidates) {
    const startTime = listById.get(p.taskListId.toString())?.startTime;
    if (!startTime) continue;
    const [h, m] = startTime.split(":").map(Number);
    const distance = Math.abs(h * 60 + m - nowMinutesLocal);
    if (distance < bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best._id;
}
