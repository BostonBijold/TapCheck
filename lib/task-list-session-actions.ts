import TaskListSession from "@/models/TaskListSession";
import Task from "@/models/Task";
import TaskLog from "@/models/TaskLog";
import type { CompletionState } from "@/models/TaskListSession";

// List-level session bookkeeping, layered on top of the per-task TaskLog
// writes in lib/task-log-actions.ts. TaskLog stays the source of truth for
// individual task state/timing; TaskListSession is a session-scoped wrapper
// tracking the list as a whole (real start/finish, completion order,
// pause/jump count). See docs/features/timer.md.
//
// Deliberately has no dependency on task-log-actions.ts (that file depends
// on this one, for the calls documented at each call site below) — keeps
// the import graph one-directional instead of circular.
//
// Everything here is scoped by companyId, not by an individual user — a
// TaskListSession represents "today's run of this task list for the
// company," and any employee on shift can pick up an already-open one or
// complete one of its tasks (see models/TaskLog.ts and
// models/TaskListSession.ts for the reasoning).

// Raw "this list's active tasks + that date's logs for them" fetch — shared
// by isTaskListFullyResolved below and by findNextTaskInList (used by the
// external trigger-task endpoint's Case 2 auto-advance, see
// external-api.md), so there's exactly one query shape for "what does this
// list look like today," not a third reimplementation of it.
async function fetchTaskListTasksAndLogs(companyId: string, taskListId: string, date: string) {
  const tasks = await Task.find({ taskListId, companyId, isActive: true })
    .sort({ order: 1 })
    .lean();
  if (tasks.length === 0) return { tasks, logs: [] as Array<{ taskId: { toString(): string }; state: string }> };

  const logs = await TaskLog.find({
    companyId,
    date,
    taskId: { $in: tasks.map((t) => t._id) },
  }).lean();
  return { tasks, logs };
}

// First task (by order) in a single task list with no log at all for date.
// Used by the external trigger-task endpoint's "advance to next task in the
// list" step (Case 2).
export async function findNextTaskInList(companyId: string, taskListId: string, date: string) {
  const { tasks, logs } = await fetchTaskListTasksAndLogs(companyId, taskListId, date);
  if (tasks.length === 0) return null;
  const loggedIds = new Set(logs.map((l) => l.taskId.toString()));
  return tasks.find((t) => !loggedIds.has(t._id.toString())) ?? null;
}

// True once every active task in the list has a terminal (done/missed/
// rest) log for date — what closes a TaskListSession. An empty/deleted list
// is never "resolved" (nothing to close against).
export async function isTaskListFullyResolved(companyId: string, taskListId: string, date: string): Promise<boolean> {
  const { tasks, logs } = await fetchTaskListTasksAndLogs(companyId, taskListId, date);
  if (tasks.length === 0) return false;
  const terminalIds = new Set(
    logs.filter((l) => l.state === "done" || l.state === "missed" || l.state === "rest").map((l) => l.taskId.toString())
  );
  return tasks.every((t) => terminalIds.has(t._id.toString()));
}

// Finds the open (in_progress) TaskListSession for this company/list/date,
// or creates one. Called whenever a task is about to become in_progress
// anchored to a list — startInProgressLog and switchActiveLog both call
// this whenever they're given a non-null sessionTaskListId, so "session
// started" always means a real task actually began running, never a guess
// reconstructed later from logs. performedByUserId is stamped only on
// creation, recording whoever actually opened this run — a later employee
// joining the same open session doesn't reassign it.
export async function ensureOpenSession(companyId: string, performedByUserId: string, taskListId: string, date: string) {
  const existing = await TaskListSession.findOne({ companyId, taskListId, date, status: "in_progress" });
  if (existing) return existing;
  return TaskListSession.create({
    companyId,
    performedByUserId,
    taskListId,
    date,
    startedAt: new Date(),
    completedAt: null,
    status: "in_progress",
    totalActualMinutes: 0,
    completionSequence: [],
    pauseOrJumpCount: 0,
  });
}

// Records a terminal completion against the open session for taskListId/
// date, if one exists — a task completing outside any session (tapped
// directly on the main task list, never anchored via sessionTaskListId) has
// nothing to match here, and callers simply don't call this in that case.
// Appends to completionSequence, folds actualMinutes into
// totalActualMinutes for `done` (missed/rest contribute 0 — same
// "terminal-but-zero" treatment Story 2's live-projection math uses), then
// closes the session the moment this leaves every active task in the list
// with a terminal log.
export async function recordSessionCompletion(
  companyId: string,
  taskListId: string,
  date: string,
  taskId: string,
  state: CompletionState,
  actualMinutes: number
) {
  const session = await TaskListSession.findOne({ companyId, taskListId, date, status: "in_progress" });
  if (!session) return;

  session.completionSequence.push({ taskId, completedAt: new Date(), state });
  if (state === "done") session.totalActualMinutes += actualMinutes;

  if (await isTaskListFullyResolved(companyId, taskListId, date)) {
    session.completedAt = new Date();
    session.status = "completed";
  }

  await session.save();
}

// Increments pauseOrJumpCount on the open session for taskListId/date, if
// one exists — both switchActiveLog (in-session navigation, only when it
// actually paused something rather than starting fresh) and the external
// trigger-task endpoint's Case 3 (a different task was active when this one
// got tapped) call this, since both represent "attention moved to a
// different task without that task being marked done."
export async function incrementSessionPauseOrJump(companyId: string, taskListId: string, date: string) {
  await TaskListSession.updateOne(
    { companyId, taskListId, date, status: "in_progress" },
    { $inc: { pauseOrJumpCount: 1 } }
  );
}
