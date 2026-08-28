import RoutineSession from "@/models/RoutineSession";
import RoutineItem from "@/models/RoutineItem";
import RoutineLog from "@/models/RoutineLog";
import type { CompletionState } from "@/models/RoutineSession";

// Group-level session bookkeeping, layered on top of the per-item RoutineLog
// writes in lib/routine-log-actions.ts. RoutineLog stays the source of truth
// for individual item state/timing; RoutineSession is a session-scoped
// wrapper tracking the routine as a whole (real start/finish, completion
// order, pause/jump count). See docs/features/timer.md.
//
// Deliberately has no dependency on routine-log-actions.ts (that file
// depends on this one, for the calls documented at each call site below) —
// keeps the import graph one-directional instead of circular.
//
// Everything here is scoped by companyId, not by an individual user — a
// RoutineSession represents "today's run of this shift group for the
// company," and any employee on shift can pick up an already-open one or
// complete one of its items (see models/RoutineLog.ts and
// models/RoutineSession.ts for the reasoning).

// Raw "this group's active items + that date's logs for them" fetch —
// shared by isGroupFullyResolved below and by findNextItemInGroup (used by
// the external trigger-habit endpoint's Case 2 auto-advance, see
// external-api.md), so there's exactly one query shape for "what does this
// group look like today," not a third reimplementation of it.
async function fetchGroupItemsAndLogs(companyId: string, groupId: string, date: string) {
  const items = await RoutineItem.find({ groupId, companyId, isActive: true })
    .sort({ order: 1 })
    .lean();
  if (items.length === 0) return { items, logs: [] as Array<{ routineItemId: { toString(): string }; state: string }> };

  const logs = await RoutineLog.find({
    companyId,
    date,
    routineItemId: { $in: items.map((i) => i._id) },
  }).lean();
  return { items, logs };
}

// First item (by order) in a single routine group with no log at all for
// date. Used by the external trigger-habit endpoint's "advance to next item
// in the group" step (Case 2).
export async function findNextItemInGroup(companyId: string, groupId: string, date: string) {
  const { items, logs } = await fetchGroupItemsAndLogs(companyId, groupId, date);
  if (items.length === 0) return null;
  const loggedIds = new Set(logs.map((l) => l.routineItemId.toString()));
  return items.find((i) => !loggedIds.has(i._id.toString())) ?? null;
}

// True once every active item in the group has a terminal (done/missed/
// rest) log for date — what closes a RoutineSession. An empty/deleted group
// is never "resolved" (nothing to close against).
export async function isGroupFullyResolved(companyId: string, groupId: string, date: string): Promise<boolean> {
  const { items, logs } = await fetchGroupItemsAndLogs(companyId, groupId, date);
  if (items.length === 0) return false;
  const terminalIds = new Set(
    logs.filter((l) => l.state === "done" || l.state === "missed" || l.state === "rest").map((l) => l.routineItemId.toString())
  );
  return items.every((i) => terminalIds.has(i._id.toString()));
}

// Finds the open (in_progress) RoutineSession for this company/group/date,
// or creates one. Called whenever an item is about to become in_progress
// anchored to a group — startInProgressLog and switchActiveLog both call
// this whenever they're given a non-null sessionGroupId, so "session
// started" always means a real item actually began running, never a guess
// reconstructed later from logs. performedByUserId is stamped only on
// creation, recording whoever actually opened this run — a later employee
// joining the same open session doesn't reassign it.
export async function ensureOpenSession(companyId: string, performedByUserId: string, groupId: string, date: string) {
  const existing = await RoutineSession.findOne({ companyId, groupId, date, status: "in_progress" });
  if (existing) return existing;
  return RoutineSession.create({
    companyId,
    performedByUserId,
    groupId,
    date,
    startedAt: new Date(),
    completedAt: null,
    status: "in_progress",
    totalActualMinutes: 0,
    completionSequence: [],
    pauseOrJumpCount: 0,
  });
}

// Records a terminal completion against the open session for groupId/date,
// if one exists — an item completing outside any session (tapped directly
// on the main Routines list, never anchored via sessionGroupId) has nothing
// to match here, and callers simply don't call this in that case. Appends
// to completionSequence, folds actualMinutes into totalActualMinutes for
// `done` (missed/rest contribute 0 — same "terminal-but-zero" treatment
// Story 2's live-projection math uses), then closes the session the moment
// this leaves every active item in the group with a terminal log.
export async function recordSessionCompletion(
  companyId: string,
  groupId: string,
  date: string,
  routineItemId: string,
  state: CompletionState,
  actualMinutes: number
) {
  const session = await RoutineSession.findOne({ companyId, groupId, date, status: "in_progress" });
  if (!session) return;

  session.completionSequence.push({ routineItemId, completedAt: new Date(), state });
  if (state === "done") session.totalActualMinutes += actualMinutes;

  if (await isGroupFullyResolved(companyId, groupId, date)) {
    session.completedAt = new Date();
    session.status = "completed";
  }

  await session.save();
}

// Increments pauseOrJumpCount on the open session for groupId/date, if one
// exists — both switchActiveLog (in-session navigation, only when it
// actually paused something rather than starting fresh) and the external
// trigger-habit endpoint's Case 3 (a different item was active when this
// one got tapped) call this, since both represent "attention moved to a
// different item without that item being marked done."
export async function incrementSessionPauseOrJump(companyId: string, groupId: string, date: string) {
  await RoutineSession.updateOne(
    { companyId, groupId, date, status: "in_progress" },
    { $inc: { pauseOrJumpCount: 1 } }
  );
}
