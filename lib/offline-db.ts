import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";

// Local SQLite mirror + outbox for offline support — see
// docs/features/offline.md. Mongo/the API remains the single source of
// truth; this is a cache and outbox, never a place the app "runs on". Every
// exported function here assumes it's only ever called from a
// Capacitor.isNativePlatform()-guarded caller (lib/offline-sync.ts,
// lib/offline-nfc-resolver.ts, components/NetworkStatusProvider.tsx) —
// there is no SQLite on plain web/PWA, so nothing here degrades gracefully
// on its own the way lib/native/*'s thin plugin wrappers do.

const DB_NAME = "chrps_offline";
const DB_VERSION = 1;

let sqliteConnection: SQLiteConnection | null = null;
let dbPromise: Promise<SQLiteDBConnection> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS task_lists (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  startTime TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  taskListId TEXT NOT NULL,
  taskDefinitionId TEXT NOT NULL,
  scheduledDays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  successThreshold INTEGER NOT NULL DEFAULT 7,
  "order" INTEGER NOT NULL DEFAULT 0,
  projectedMinutes INTEGER,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_taskListId ON tasks(taskListId);
CREATE INDEX IF NOT EXISTS idx_tasks_taskDefinitionId ON tasks(taskDefinitionId);
CREATE TABLE IF NOT EXISTS task_definitions (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  taskType TEXT NOT NULL,
  formFields TEXT NOT NULL DEFAULT '[]',
  nfcTagUid TEXT,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_definitions_nfcTagUid ON task_definitions(nfcTagUid);
CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  taskId TEXT NOT NULL,
  performedByUserId TEXT,
  date TEXT NOT NULL,
  state TEXT NOT NULL,
  startedAt TEXT,
  completedAt TEXT,
  formValues TEXT,
  updatedAt TEXT,
  syncStatus TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_task_logs_taskId_date ON task_logs(taskId, date);
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  operation TEXT NOT NULL,
  taskLogId TEXT NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  retryCount INTEGER NOT NULL DEFAULT 0,
  lastError TEXT
);
CREATE TABLE IF NOT EXISTS sync_meta (
  companyId TEXT PRIMARY KEY,
  lastFullSyncAt TEXT,
  lastQueueFlushAt TEXT
);
`;

async function getDb(): Promise<SQLiteDBConnection> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Offline storage is only available in the native app");
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      sqliteConnection = sqliteConnection ?? new SQLiteConnection(CapacitorSQLite);
      const { result: alreadyOpen } = await sqliteConnection.isConnection(DB_NAME, false);
      const db = alreadyOpen
        ? await sqliteConnection.retrieveConnection(DB_NAME, false)
        : await sqliteConnection.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
      await db.open();
      await db.execute(SCHEMA, false);
      return db;
    })();
  }
  return dbPromise;
}

// ---- Row shapes (mirror the Mongo documents they're synced from, plus the
// local-only syncStatus column on task_logs — see docs/features/offline.md) ----

export interface OfflineTaskList {
  id: string;
  companyId: string;
  name: string;
  startTime: string | null;
  order: number;
  updatedAt: string | null;
}
export interface OfflineTask {
  id: string;
  companyId: string;
  taskListId: string;
  taskDefinitionId: string;
  scheduledDays: number[];
  successThreshold: number;
  order: number;
  projectedMinutes: number | null;
  updatedAt: string | null;
}
export interface OfflineTaskDefinition {
  id: string;
  companyId: string;
  name: string;
  icon: string;
  taskType: string;
  formFields: unknown[];
  nfcTagUid: string | null;
  updatedAt: string | null;
}
export type OfflineSyncStatus = "synced" | "pending" | "conflict";
export interface OfflineTaskLog {
  id: string;
  companyId: string;
  taskId: string;
  performedByUserId: string | null;
  date: string;
  state: string;
  startedAt: string | null;
  completedAt: string | null;
  formValues: Record<string, unknown> | null;
  updatedAt: string | null;
  syncStatus: OfflineSyncStatus;
}
export interface OfflineSyncQueueRow {
  id: string;
  entity: "task_log";
  operation: "create" | "update" | "delete";
  taskLogId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

// ---- Generic helpers ----

async function run(sql: string, values: unknown[] = []) {
  const db = await getDb();
  await db.run(sql, values);
}

async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.query(sql, values);
  return (res.values ?? []) as T[];
}

// ---- task_lists ----

export async function upsertTaskLists(rows: OfflineTaskList[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.executeSet(
    rows.map((r) => ({
      statement: `INSERT INTO task_lists (id, companyId, name, startTime, "order", updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET companyId=excluded.companyId, name=excluded.name,
          startTime=excluded.startTime, "order"=excluded."order", updatedAt=excluded.updatedAt`,
      values: [r.id, r.companyId, r.name, r.startTime, r.order, r.updatedAt],
    })),
    false
  );
}

export async function getTaskLists(companyId: string): Promise<OfflineTaskList[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, companyId, name, startTime, "order" as "order", updatedAt FROM task_lists WHERE companyId = ?`,
    [companyId]
  );
  return rows.map((r) => ({
    id: r.id as string,
    companyId: r.companyId as string,
    name: r.name as string,
    startTime: (r.startTime as string) ?? null,
    order: Number(r.order),
    updatedAt: (r.updatedAt as string) ?? null,
  }));
}

export async function pruneTaskLists(companyId: string, keepIds: string[]) {
  await pruneByIds("task_lists", companyId, keepIds);
}

// ---- tasks ----

export async function upsertTasks(rows: OfflineTask[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.executeSet(
    rows.map((r) => ({
      statement: `INSERT INTO tasks (id, companyId, taskListId, taskDefinitionId, scheduledDays, successThreshold, "order", projectedMinutes, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET companyId=excluded.companyId, taskListId=excluded.taskListId,
          taskDefinitionId=excluded.taskDefinitionId, scheduledDays=excluded.scheduledDays,
          successThreshold=excluded.successThreshold, "order"=excluded."order",
          projectedMinutes=excluded.projectedMinutes, updatedAt=excluded.updatedAt`,
      values: [
        r.id,
        r.companyId,
        r.taskListId,
        r.taskDefinitionId,
        JSON.stringify(r.scheduledDays),
        r.successThreshold,
        r.order,
        r.projectedMinutes,
        r.updatedAt,
      ],
    })),
    false
  );
}

function rowToTask(r: Record<string, unknown>): OfflineTask {
  return {
    id: r.id as string,
    companyId: r.companyId as string,
    taskListId: r.taskListId as string,
    taskDefinitionId: r.taskDefinitionId as string,
    scheduledDays: JSON.parse((r.scheduledDays as string) ?? "[]"),
    successThreshold: Number(r.successThreshold),
    order: Number(r.order),
    projectedMinutes: r.projectedMinutes == null ? null : Number(r.projectedMinutes),
    updatedAt: (r.updatedAt as string) ?? null,
  };
}

export async function getTasksForTaskList(taskListId: string): Promise<OfflineTask[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, companyId, taskListId, taskDefinitionId, scheduledDays, successThreshold, "order" as "order", projectedMinutes, updatedAt
     FROM tasks WHERE taskListId = ?`,
    [taskListId]
  );
  return rows.map(rowToTask);
}

export async function getTasksForDefinition(taskDefinitionId: string): Promise<OfflineTask[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, companyId, taskListId, taskDefinitionId, scheduledDays, successThreshold, "order" as "order", projectedMinutes, updatedAt
     FROM tasks WHERE taskDefinitionId = ?`,
    [taskDefinitionId]
  );
  return rows.map(rowToTask);
}

export async function pruneTasks(companyId: string, keepIds: string[]) {
  await pruneByIds("tasks", companyId, keepIds);
}

// ---- task_definitions ----

export async function upsertTaskDefinitions(rows: OfflineTaskDefinition[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.executeSet(
    rows.map((r) => ({
      statement: `INSERT INTO task_definitions (id, companyId, name, icon, taskType, formFields, nfcTagUid, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET companyId=excluded.companyId, name=excluded.name, icon=excluded.icon,
          taskType=excluded.taskType, formFields=excluded.formFields, nfcTagUid=excluded.nfcTagUid,
          updatedAt=excluded.updatedAt`,
      values: [r.id, r.companyId, r.name, r.icon, r.taskType, JSON.stringify(r.formFields), r.nfcTagUid, r.updatedAt],
    })),
    false
  );
}

function rowToDefinition(r: Record<string, unknown>): OfflineTaskDefinition {
  return {
    id: r.id as string,
    companyId: r.companyId as string,
    name: r.name as string,
    icon: r.icon as string,
    taskType: r.taskType as string,
    formFields: JSON.parse((r.formFields as string) ?? "[]"),
    nfcTagUid: (r.nfcTagUid as string) ?? null,
    updatedAt: (r.updatedAt as string) ?? null,
  };
}

// The offline equivalent of TaskDefinition.findOne({ nfcTagUid }) in
// app/api/tasks/by-nfc-uid/route.ts — see lib/offline-nfc-resolver.ts.
export async function getTaskDefinitionsByNfcUid(uid: string): Promise<OfflineTaskDefinition[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, companyId, name, icon, taskType, formFields, nfcTagUid, updatedAt FROM task_definitions WHERE nfcTagUid = ?`,
    [uid.toLowerCase()]
  );
  return rows.map(rowToDefinition);
}

export async function pruneTaskDefinitions(companyId: string, keepIds: string[]) {
  await pruneByIds("task_definitions", companyId, keepIds);
}

// ---- task_logs ----

// Never overwrites a row with syncStatus 'pending' — that row represents an
// offline mutation not yet acknowledged by the server (see
// docs/features/offline.md's pull-sync step 3). Rows this function writes
// are always pulled-down server state, so they're always written as
// 'synced'.
export async function upsertSyncedTaskLogs(rows: Omit<OfflineTaskLog, "syncStatus">[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.executeSet(
    rows.map((r) => ({
      statement: `INSERT INTO task_logs (id, companyId, taskId, performedByUserId, date, state, startedAt, completedAt, formValues, updatedAt, syncStatus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
        ON CONFLICT(id) DO UPDATE SET
          companyId=excluded.companyId, taskId=excluded.taskId, performedByUserId=excluded.performedByUserId,
          date=excluded.date, state=excluded.state, startedAt=excluded.startedAt, completedAt=excluded.completedAt,
          formValues=excluded.formValues, updatedAt=excluded.updatedAt, syncStatus='synced'
        WHERE (SELECT syncStatus FROM task_logs WHERE id = excluded.id) IS NOT 'pending'`,
      values: [
        r.id,
        r.companyId,
        r.taskId,
        r.performedByUserId,
        r.date,
        r.state,
        r.startedAt,
        r.completedAt,
        r.formValues ? JSON.stringify(r.formValues) : null,
        r.updatedAt,
      ],
    })),
    false
  );
}

// Writes/updates a single local task_logs row as the result of an offline
// mutation (see docs/features/offline.md's "Offline mutation queue"). The
// UI reads this same table, so this is what makes the state change feel
// instant and normal, not a degraded "offline mode".
export async function upsertPendingTaskLog(row: Omit<OfflineTaskLog, "syncStatus">) {
  await run(
    `INSERT INTO task_logs (id, companyId, taskId, performedByUserId, date, state, startedAt, completedAt, formValues, updatedAt, syncStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET
       companyId=excluded.companyId, taskId=excluded.taskId, performedByUserId=excluded.performedByUserId,
       date=excluded.date, state=excluded.state, startedAt=excluded.startedAt, completedAt=excluded.completedAt,
       formValues=excluded.formValues, updatedAt=excluded.updatedAt, syncStatus='pending'`,
    [
      row.id,
      row.companyId,
      row.taskId,
      row.performedByUserId,
      row.date,
      row.state,
      row.startedAt,
      row.completedAt,
      row.formValues ? JSON.stringify(row.formValues) : null,
      row.updatedAt,
    ]
  );
}

export async function markTaskLogConflict(id: string) {
  await run(`UPDATE task_logs SET syncStatus = 'conflict' WHERE id = ?`, [id]);
}

// Called once a queued mutation for this row is confirmed synced — the row
// is deleted rather than renamed onto the server's real _id (a locally
// pending row is keyed by a synthetic local id, see
// lib/offline-sync.ts's localTaskLogId, not the eventual Mongo _id) because
// the reconnect flow always runs flushQueue() immediately followed by
// pullSync() (see components/NetworkStatusProvider.tsx), which repopulates
// the authoritative row under its real id right after.
export async function deleteTaskLog(id: string) {
  await run(`DELETE FROM task_logs WHERE id = ?`, [id]);
}

export async function getTaskLogByTaskAndDate(taskId: string, date: string): Promise<OfflineTaskLog | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM task_logs WHERE taskId = ? AND date = ?`,
    [taskId, date]
  );
  return rows[0] ? rowToTaskLog(rows[0]) : null;
}

function rowToTaskLog(r: Record<string, unknown>): OfflineTaskLog {
  return {
    id: r.id as string,
    companyId: r.companyId as string,
    taskId: r.taskId as string,
    performedByUserId: (r.performedByUserId as string) ?? null,
    date: r.date as string,
    state: r.state as string,
    startedAt: (r.startedAt as string) ?? null,
    completedAt: (r.completedAt as string) ?? null,
    formValues: r.formValues ? JSON.parse(r.formValues as string) : null,
    updatedAt: (r.updatedAt as string) ?? null,
    syncStatus: (r.syncStatus as OfflineSyncStatus) ?? "synced",
  };
}

export async function getTaskLogsForDate(companyId: string, date: string): Promise<OfflineTaskLog[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM task_logs WHERE companyId = ? AND date = ?`,
    [companyId, date]
  );
  return rows.map(rowToTaskLog);
}

export async function getTaskLogsForTaskIds(taskIds: string[], date: string): Promise<OfflineTaskLog[]> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM task_logs WHERE date = ? AND taskId IN (${placeholders})`,
    [date, ...taskIds]
  );
  return rows.map(rowToTaskLog);
}

// ---- sync_queue (the outbox) ----

export async function enqueueMutation(row: Omit<OfflineSyncQueueRow, "retryCount" | "lastError">) {
  await run(
    `INSERT INTO sync_queue (id, entity, operation, taskLogId, payload, createdAt, retryCount, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [row.id, row.entity, row.operation, row.taskLogId, JSON.stringify(row.payload), row.createdAt]
  );
}

export async function getPendingQueue(): Promise<OfflineSyncQueueRow[]> {
  const rows = await query<Record<string, unknown>>(`SELECT * FROM sync_queue ORDER BY createdAt ASC`);
  return rows.map((r) => ({
    id: r.id as string,
    entity: r.entity as "task_log",
    operation: r.operation as OfflineSyncQueueRow["operation"],
    taskLogId: r.taskLogId as string,
    payload: JSON.parse(r.payload as string),
    createdAt: r.createdAt as string,
    retryCount: Number(r.retryCount),
    lastError: (r.lastError as string) ?? null,
  }));
}

export async function deleteQueueRow(id: string) {
  await run(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function markQueueRowFailed(id: string, error: string) {
  await run(`UPDATE sync_queue SET retryCount = retryCount + 1, lastError = ? WHERE id = ?`, [error, id]);
}

export async function getPendingQueueCount(): Promise<number> {
  const rows = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sync_queue`);
  return Number(rows[0]?.count ?? 0);
}

// ---- sync_meta ----

export interface OfflineSyncMeta {
  companyId: string;
  lastFullSyncAt: string | null;
  lastQueueFlushAt: string | null;
}

export async function getSyncMeta(companyId: string): Promise<OfflineSyncMeta | null> {
  const rows = await query<Record<string, unknown>>(`SELECT * FROM sync_meta WHERE companyId = ?`, [companyId]);
  if (!rows[0]) return null;
  return {
    companyId: rows[0].companyId as string,
    lastFullSyncAt: (rows[0].lastFullSyncAt as string) ?? null,
    lastQueueFlushAt: (rows[0].lastQueueFlushAt as string) ?? null,
  };
}

export async function setSyncMeta(meta: Partial<OfflineSyncMeta> & { companyId: string }) {
  const existing = await getSyncMeta(meta.companyId);
  const merged: OfflineSyncMeta = {
    companyId: meta.companyId,
    lastFullSyncAt: meta.lastFullSyncAt ?? existing?.lastFullSyncAt ?? null,
    lastQueueFlushAt: meta.lastQueueFlushAt ?? existing?.lastQueueFlushAt ?? null,
  };
  await run(
    `INSERT INTO sync_meta (companyId, lastFullSyncAt, lastQueueFlushAt) VALUES (?, ?, ?)
     ON CONFLICT(companyId) DO UPDATE SET lastFullSyncAt=excluded.lastFullSyncAt, lastQueueFlushAt=excluded.lastQueueFlushAt`,
    [merged.companyId, merged.lastFullSyncAt, merged.lastQueueFlushAt]
  );
}

// ---- shared prune helper ----

// Removes rows for a company no longer present in `keepIds` — the "the
// company no longer has this" step of a full pull-sync (doc: "Rows for
// lists/tasks/definitions the company no longer has are removed locally on
// a full sync"). Never applied to task_logs — see
// docs/features/offline.md's scoping (only today's logs are cached, and a
// pending row must never be silently dropped just because a sync happened
// to run before it flushed).
async function pruneByIds(table: "task_lists" | "tasks" | "task_definitions", companyId: string, keepIds: string[]) {
  const db = await getDb();
  if (keepIds.length === 0) {
    await db.run(`DELETE FROM ${table} WHERE companyId = ?`, [companyId]);
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  await db.run(`DELETE FROM ${table} WHERE companyId = ? AND id NOT IN (${placeholders})`, [companyId, ...keepIds]);
}
