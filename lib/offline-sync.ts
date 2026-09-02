import type { LogState } from "@/models/TaskLog";
import type { FormFieldValue } from "@/models/TaskDefinition";
import {
  upsertTaskLists,
  upsertTasks,
  upsertTaskDefinitions,
  upsertSyncedTaskLogs,
  upsertPendingTaskLog,
  pruneTaskLists,
  pruneTasks,
  pruneTaskDefinitions,
  getPendingQueue,
  deleteQueueRow,
  markQueueRowFailed,
  deleteTaskLog,
  markTaskLogConflict,
  getTaskLogByTaskAndDate,
  setSyncMeta,
  enqueueMutation,
  type OfflineTaskList,
  type OfflineTask,
  type OfflineTaskDefinition,
} from "./offline-db";

// Pull sync (mirror server state down) + queue flush (replay offline
// mutations up) — see docs/features/offline.md. Mongo/the API remain the
// single source of truth; this module only moves data between them and the
// local SQLite cache (lib/offline-db.ts).

// ---- API response shapes (see the routes named below — extended to carry
// what the offline cache needs, see docs/features/offline.md's "Correction
// to the doc's pull-sync source") ----

interface ApiTaskListResponse {
  _id: string;
  name: string;
  timeOfDay: string;
  startTime: string | null;
  order: number;
  updatedAt: string | null;
  tasks: Array<{
    _id: string;
    taskListId: string;
    definitionId: string;
    scheduledDays: number[];
    successThreshold: number;
    projectedMinutes: number | null;
    order: number;
    updatedAt: string | null;
  }>;
}

interface ApiTaskDefinitionResponse {
  _id: string;
  companyId: string;
  name: string;
  icon: string;
  taskType: string;
  formFields: unknown[];
  nfcTagUid: string | null;
  updatedAt: string | null;
}

interface ApiTaskLogResponse {
  _id: string;
  taskId: string;
  date: string;
  state: LogState;
  startedAt: string | null;
  completedAt: string | null;
  formData: Record<string, FormFieldValue> | null;
  performedByUserId: string | null;
  updatedAt: string | null;
}

// Pulls the company's current task lists/tasks/definitions plus the given
// date's logs from the live API (GET /api/task-lists, GET
// /api/task-definitions, GET /api/task-logs?date=) and mirrors them into
// the local cache — see docs/features/offline.md's "Pull sync". A failed
// fetch (still offline, or a transient error) is a silent no-op: the cache
// just stays whatever it was, exactly as if this call hadn't happened.
export async function pullSync(companyId: string, date: string): Promise<void> {
  let listsRes: Response, defsRes: Response, logsRes: Response;
  try {
    [listsRes, defsRes, logsRes] = await Promise.all([
      fetch("/api/task-lists"),
      fetch("/api/task-definitions"),
      fetch(`/api/task-logs?date=${encodeURIComponent(date)}`),
    ]);
  } catch {
    return;
  }
  if (!listsRes.ok || !defsRes.ok || !logsRes.ok) return;

  const lists: ApiTaskListResponse[] = await listsRes.json();
  const definitions: ApiTaskDefinitionResponse[] = await defsRes.json();
  const logs: ApiTaskLogResponse[] = await logsRes.json();

  const taskListRows: OfflineTaskList[] = lists.map((l) => ({
    id: l._id,
    companyId,
    name: l.name,
    startTime: l.startTime,
    order: l.order,
    updatedAt: l.updatedAt,
  }));
  const taskRows: OfflineTask[] = lists.flatMap((l) =>
    l.tasks.map((t) => ({
      id: t._id,
      companyId,
      taskListId: t.taskListId,
      taskDefinitionId: t.definitionId,
      scheduledDays: t.scheduledDays,
      successThreshold: t.successThreshold,
      order: t.order,
      projectedMinutes: t.projectedMinutes,
      updatedAt: t.updatedAt,
    }))
  );
  const definitionRows: OfflineTaskDefinition[] = definitions.map((d) => ({
    id: d._id,
    companyId: d.companyId,
    name: d.name,
    icon: d.icon,
    taskType: d.taskType,
    formFields: d.formFields,
    nfcTagUid: d.nfcTagUid,
    updatedAt: d.updatedAt,
  }));
  const logRows = logs.map((l) => ({
    id: l._id,
    companyId,
    taskId: l.taskId,
    performedByUserId: l.performedByUserId,
    date: l.date,
    state: l.state,
    startedAt: l.startedAt,
    completedAt: l.completedAt,
    formValues: l.formData,
    updatedAt: l.updatedAt,
  }));

  await upsertTaskLists(taskListRows);
  await upsertTasks(taskRows);
  await upsertTaskDefinitions(definitionRows);
  // Never overwrites a 'pending' row — see upsertSyncedTaskLogs in
  // lib/offline-db.ts.
  await upsertSyncedTaskLogs(logRows);

  await pruneTaskLists(companyId, taskListRows.map((r) => r.id));
  await pruneTasks(companyId, taskRows.map((r) => r.id));
  await pruneTaskDefinitions(companyId, definitionRows.map((r) => r.id));
  // task_logs is deliberately never pruned here — only today's date is ever
  // fetched, so a row for a different date (shouldn't exist, but
  // defensively) or a still-'pending' row must never be swept away by a
  // sync that only knows about today.

  await setSyncMeta({ companyId, lastFullSyncAt: new Date().toISOString() });
}

// A locally-created log has no server _id yet. Keyed by taskId+date (the
// same uniqueness TaskLog itself enforces — companyId+taskId+date, one
// shared record per task per day) so repeated offline edits to the same
// task update one row instead of accumulating duplicates, and so an
// already-synced row (real Mongo _id) gets reused by its real id instead of
// a second synthetic one being created alongside it.
function localTaskLogId(taskId: string, date: string): string {
  return `local:${taskId}:${date}`;
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Called from the client-side call sites that would otherwise `fetch(
// "/api/task-logs", ...)` — components/TasksView.tsx's handlers and
// components/TaskListSessionView.tsx's saveLog/per-task-switch effect — when
// NetworkStatusProvider reports offline. Writes the local task_logs row
// exactly as if the API call had already succeeded (syncStatus: 'pending')
// and appends the matching outbox entry, replayed verbatim (same method +
// body) on reconnect by flushQueue below — see docs/features/offline.md's
// "Offline mutation queue".
export async function queueTaskLogMutation(params: {
  method: "POST" | "PATCH";
  companyId: string;
  taskId: string;
  performedByUserId: string;
  date: string;
  state: LogState;
  startedAt?: string | null;
  completedAt?: string | null;
  formValues?: Record<string, FormFieldValue> | null;
  body: Record<string, unknown>;
}): Promise<void> {
  const existing = await getTaskLogByTaskAndDate(params.taskId, params.date);
  const id = existing?.id ?? localTaskLogId(params.taskId, params.date);
  const now = new Date().toISOString();

  await upsertPendingTaskLog({
    id,
    companyId: params.companyId,
    taskId: params.taskId,
    performedByUserId: params.performedByUserId,
    date: params.date,
    state: params.state,
    startedAt: params.startedAt ?? null,
    completedAt: params.completedAt ?? null,
    formValues: params.formValues ?? null,
    updatedAt: now,
  });

  await enqueueMutation({
    id: randomId(),
    entity: "task_log",
    operation: params.method === "POST" ? "create" : "update",
    taskLogId: id,
    payload: { method: params.method, body: params.body },
    createdAt: now,
  });
}

// Replays sync_queue in order against the same app/api/task-logs route each
// mutation would have hit online — see docs/features/offline.md's "Offline
// mutation queue". Stops at the first network failure (still offline —
// nothing after it can succeed either); a validation-error response (4xx —
// the server actively rejected it, e.g. an NFC mismatch) marks the log
// 'conflict' and the queue row gets a lastError instead of being retried
// forever on a request the server will never accept (rows with a
// lastError already set are skipped on later flushes).
export async function flushQueue(): Promise<void> {
  const pending = await getPendingQueue();
  for (const row of pending) {
    if (row.lastError) continue;
    const { method, body } = row.payload as { method: "POST" | "PATCH"; body: Record<string, unknown> };

    let res: Response;
    try {
      res = await fetch("/api/task-logs", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return; // still offline — leave the rest of the queue for next time
    }

    if (res.ok) {
      await deleteTaskLog(row.taskLogId);
      await deleteQueueRow(row.id);
    } else {
      const errBody = await res.json().catch(() => ({}));
      await markTaskLogConflict(row.taskLogId);
      await markQueueRowFailed(row.id, errBody.error || `HTTP ${res.status}`);
    }
  }
}
