import mongoose from "mongoose";
import TaskDefinition from "@/models/TaskDefinition";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";
import TaskLog from "@/models/TaskLog";
import type { TaskType, FormFieldDef } from "@/models/TaskDefinition";
import { pickMostRelevantPlacement } from "./placement-resolution";
export { pickMostRelevantPlacement } from "./placement-resolution";

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

// Shared by both NFC-binding routes — app/api/tasks/[id]/nfc-tag (resolves
// a specific list placement to its definitionId first) and
// app/api/task-definitions/[id]/nfc-tag (binds a definition directly, so it
// works even for one not yet placed in any list). A physical tag identifies
// exactly one task, permanently (see docs/features/nfc.md's "FAB 'scan to
// open' shortcut"), so binding it here always clears that UID off any OTHER
// definition in the company first — without this, re-linking an
// already-used tag would leave two definitions answering to the same UID,
// and GET /api/tasks/by-nfc-uid's lookup could resolve to either one.
export async function bindNfcTag(companyId: string, definitionId: string, uid: string) {
  const normalizedUid = uid.toLowerCase();
  await TaskDefinition.updateMany(
    { companyId, nfcTagUid: normalizedUid, _id: { $ne: definitionId } },
    { $set: { nfcTagUid: null } }
  );
  return TaskDefinition.findOneAndUpdate(
    { _id: definitionId, companyId },
    { $set: { nfcTagUid: normalizedUid } },
    { returnDocument: "after" }
  );
}

export async function unbindNfcTag(companyId: string, definitionId: string) {
  return TaskDefinition.findOneAndUpdate(
    { _id: definitionId, companyId },
    { $set: { nfcTagUid: null } },
    { returnDocument: "after" }
  );
}

// Resolves a scanned/bound TaskDefinition to whichever of its active
// placements is "most relevant right now" — needed because, unlike before
// the catalog split, one physical tag (bound at the definition level) can
// now back more than one list placement (e.g. the fridge-temp check placed
// in both the opening and closing lists). Thin Mongo-reading wrapper around
// pickMostRelevantPlacement above — see that function for the actual
// selection logic and rationale.
export async function resolveMostRelevantPlacement(
  companyId: string,
  definitionId: string,
  localDate: string,
  nowMinutesLocal: number | null
): Promise<mongoose.Types.ObjectId | null> {
  const placements = await Task.find({ companyId, definitionId, isActive: true }).lean();
  if (placements.length === 0) return null;

  const taskLists = await TaskList.find({
    _id: { $in: placements.map((p) => p.taskListId) },
    companyId,
  }).lean();

  const logs = await TaskLog.find({
    companyId,
    date: localDate,
    taskId: { $in: placements.map((p) => p._id) },
  }).lean();

  const placementById = new Map(placements.map((p) => [p._id.toString(), p]));
  const bestId = pickMostRelevantPlacement(
    placements.map((p) => ({ id: p._id.toString(), taskListId: p.taskListId.toString(), order: p.order })),
    taskLists.map((tl) => ({ id: tl._id.toString(), order: tl.order, startTime: tl.startTime ?? null })),
    logs.map((l) => ({ taskId: l.taskId.toString(), state: l.state })),
    nowMinutesLocal
  );
  return bestId ? placementById.get(bestId)!._id : null;
}
