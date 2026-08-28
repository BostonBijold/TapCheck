import RoutineLog from "@/models/RoutineLog";
import type { LogState } from "@/models/RoutineLog";
import { ensureOpenSession, incrementSessionPauseOrJump, recordSessionCompletion } from "@/lib/routine-session-actions";

// Shared by app/api/routine-logs (internal, session-authenticated) and
// app/api/external/start-timer (API-key-authenticated) so both paths behave
// identically — starting a timer always goes through here.

// bankedSeconds is elapsed time already accumulated in an earlier running
// segment of this same log (see pausedSeconds on the model) — added on top
// of the time since startedAt so resuming a paused item and later finishing
// it credits the full total, not just the final segment.
export function minutesSince(startedAt: Date, bankedSeconds = 0): number {
  return Math.max(1, Math.round((bankedSeconds * 1000 + (Date.now() - startedAt.getTime())) / 60000));
}

export function serializeLog(l: {
  _id: { toString(): string };
  routineItemId: { toString(): string };
  date: string;
  actualMinutes?: number | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  pausedSeconds?: number | null;
  state: LogState;
  sessionGroupId?: { toString(): string } | null;
  formData?: Record<string, string | number | boolean> | null;
  tagId?: string | null;
}) {
  return {
    _id: l._id.toString(),
    routineItemId: l.routineItemId.toString(),
    date: l.date,
    actualMinutes: l.actualMinutes ?? null,
    startedAt: l.startedAt ? new Date(l.startedAt).toISOString() : null,
    completedAt: l.completedAt ? new Date(l.completedAt).toISOString() : null,
    pausedSeconds: l.pausedSeconds ?? 0,
    state: l.state,
    sessionGroupId: l.sessionGroupId ? l.sessionGroupId.toString() : null,
    formData: l.formData ?? null,
    tagId: l.tagId ?? null,
  };
}

// Auto-completes any dangling in_progress log for this specific person
// (performedByUserId) other than exceptRoutineItemId — on any date, any
// item — crediting elapsed time + banked pausedSeconds, minimum 1 minute.
// Scoped per-person, not per-company: a company's staff can run several
// checks concurrently, but one physical person can't be running two timers
// at once. Extracted out of startInProgressLog so the external
// trigger-habit endpoint's immediate-done path (checkbox items, which never
// go through startInProgressLog at all) still enforces the same
// single-active-timer invariant before writing its own log.
export async function completeStrayInProgressLogs(companyId: string, performedByUserId: string, exceptRoutineItemId: string) {
  const stray = await RoutineLog.find({
    companyId,
    performedByUserId,
    state: "in_progress",
    routineItemId: { $ne: exceptRoutineItemId },
  }).lean();

  for (const s of stray) {
    const startedAt = s.startedAt ? new Date(s.startedAt) : null;
    await RoutineLog.updateOne(
      { _id: s._id },
      {
        $set: {
          state: "done",
          completedAt: new Date(),
          actualMinutes: startedAt ? minutesSince(startedAt, s.pausedSeconds ?? 0) : 1,
          pausedSeconds: 0,
          sessionGroupId: null,
        },
      }
    );
  }
}

// Starts (or restarts) a timer for routineItemId on date, enforcing a single
// active timer per person: any other in_progress log for performedByUserId
// — on any item, any date — is auto-completed first, crediting it with the
// elapsed time since its own startedAt, rather than being left dangling.
// Used by the external API and by starting a habit's standalone timer —
// both mean "I've actually moved on to doing something else," unlike
// navigating inside an already-open Routine Session (see switchActiveLog
// below). Callers must have already called connectDB().
//
// The RoutineLog itself is looked up by companyId + routineItemId + date —
// one shared record per item per day for the whole company (any employee on
// shift might complete a given check) — with performedByUserId stamped as
// whoever is starting it right now.
//
// sessionGroupId, when set, marks this timer as anchored inside a Routine
// Session for that group — see models/RoutineLog.ts.
export async function startInProgressLog(
  companyId: string,
  performedByUserId: string,
  routineItemId: string,
  date: string,
  sessionGroupId: string | null = null
) {
  await completeStrayInProgressLogs(companyId, performedByUserId, routineItemId);
  // A RoutineSession exists per group/date the moment its first item
  // actually starts running — see lib/routine-session-actions.ts. No-op
  // when sessionGroupId is null (a bare standalone-timer start, not
  // anchored to any group/session).
  if (sessionGroupId) await ensureOpenSession(companyId, performedByUserId, sessionGroupId, date);

  const existing = await RoutineLog.findOne({ companyId, routineItemId, date }).lean();

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    {
      $set: {
        state: "in_progress",
        startedAt: new Date(),
        completedAt: null,
        actualMinutes: null,
        isBackEntry: false,
        sessionGroupId,
        performedByUserId,
        // TODO: tagId — once the NFC reader lands, a tag-triggered start
        // (external API) will pass the resolved tag identifier through to
        // here and it should be stamped on the log alongside sessionGroupId.
        // Resuming something that was paused (e.g. left mid-session earlier
        // today) keeps its banked time; a genuinely fresh start has none.
        pausedSeconds: existing?.state === "paused" ? (existing.pausedSeconds ?? 0) : 0,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return log;
}

// Switches which item is the single active timer WITHOUT ever marking the
// one being left behind done or missed — used only for navigating between
// items inside an already-open Routine Session (advancing or jumping).
// Moving your attention to a different item in the same session is still
// "only one thing is actually running at a time" (going from cooking to
// getting dressed means cooking's clock stops, it doesn't finish cooking) —
// but it is NOT "I've decided this habit is done." So the item you're
// leaving is paused: its elapsed-so-far is banked into pausedSeconds and its
// startedAt is cleared, but its state never becomes done/missed/rest.
// Only an explicit Done/Missed/Rest (app button or API) ever marks a habit.
//
// If the target item was previously paused (jumped away and back), its
// banked pausedSeconds carries forward and a fresh startedAt is stamped, so
// total elapsed = pausedSeconds + (now - startedAt) keeps counting up
// correctly instead of resetting. If it's already the active in_progress
// log (e.g. opening straight into it), it's returned untouched.
export async function switchActiveLog(
  companyId: string,
  performedByUserId: string,
  routineItemId: string,
  date: string,
  sessionGroupId: string | null
) {
  // Same creation rule as startInProgressLog: the first call for a group/
  // date (nothing to pause yet, see below) is what actually opens the
  // RoutineSession; every later call for the same group/date just reuses it.
  if (sessionGroupId) await ensureOpenSession(companyId, performedByUserId, sessionGroupId, date);

  const others = await RoutineLog.find({
    companyId,
    performedByUserId,
    state: "in_progress",
    routineItemId: { $ne: routineItemId },
  }).lean();

  // Only counts as a "jump" if something was actually running and got
  // pushed aside — the very first item of a session has nothing to switch
  // away from, so that opening move isn't attention moving away from
  // anything and shouldn't inflate the count.
  if (sessionGroupId && others.length > 0) {
    await incrementSessionPauseOrJump(companyId, sessionGroupId, date);
  }

  for (const o of others) {
    const startedAt = o.startedAt ? new Date(o.startedAt) : null;
    const ranSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)) : 0;
    await RoutineLog.updateOne(
      { _id: o._id },
      {
        $set: {
          state: "paused",
          startedAt: null,
          pausedSeconds: (o.pausedSeconds ?? 0) + ranSeconds,
        },
      }
    );
  }

  const existing = await RoutineLog.findOne({ companyId, routineItemId, date }).lean();
  if (existing?.state === "in_progress") {
    return existing;
  }

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    {
      $set: {
        state: "in_progress",
        startedAt: new Date(),
        completedAt: null,
        actualMinutes: null,
        isBackEntry: false,
        sessionGroupId,
        performedByUserId,
        pausedSeconds: existing?.state === "paused" ? (existing.pausedSeconds ?? 0) : 0,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return log;
}

// Writes a terminal `done` log immediately, actualMinutes: 0, no
// intermediate in_progress state — for item types with no timer (checkbox).
// Used by the external trigger-habit endpoint's start half when the tapped
// item isn't a standard/stopwatch item. Still enforces the single-active-
// timer invariant via completeStrayInProgressLogs, exactly like
// startInProgressLog does.
//
// groupId, when given, records this immediate completion against that
// group's open RoutineSession (if one exists) — see
// lib/routine-session-actions.ts. Note this never *creates* a session: an
// immediate-done item skips the in_progress step entirely, which is the
// only thing that opens one (see startInProgressLog/switchActiveLog), so a
// routine whose very first tapped item is a checkbox won't get a session
// until a later, real-timer item starts one.
export async function startImmediateLog(
  companyId: string,
  performedByUserId: string,
  routineItemId: string,
  date: string,
  groupId: string | null = null
) {
  await completeStrayInProgressLogs(companyId, performedByUserId, routineItemId);

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    {
      $set: {
        state: "done",
        startedAt: null,
        completedAt: new Date(),
        actualMinutes: 0,
        pausedSeconds: 0,
        isBackEntry: false,
        sessionGroupId: null,
        performedByUserId,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (groupId) await recordSessionCompletion(companyId, groupId, date, routineItemId, "done", 0);

  return log;
}

// Completes an in_progress timer log, deriving actualMinutes from startedAt
// + banked pausedSeconds (minimum 1 minute) — the same math
// PATCH /api/routine-logs's timer-completion branch uses, factored out here
// so it isn't duplicated by the external trigger-habit endpoint's
// complete-the-active-item half. fallbackMinutes only applies if the log
// somehow has neither a startedAt nor banked time (shouldn't happen for a
// genuinely in_progress log, but mirrors the PATCH route's existing
// defensiveness). performedByUserId is stamped as whoever completes it,
// which may differ from whoever started it (someone else picked it up).
export async function completeInProgressLog(
  companyId: string,
  performedByUserId: string,
  routineItemId: string,
  date: string,
  fallbackMinutes = 1,
  formData: Record<string, string | number | boolean> | null = null
) {
  const existing = await RoutineLog.findOne({ companyId, routineItemId, date }).lean();
  const startedAt = existing?.startedAt ? new Date(existing.startedAt) : null;
  const banked = existing?.pausedSeconds ?? 0;
  const actualMinutes = startedAt
    ? minutesSince(startedAt, banked)
    : banked > 0
      ? Math.max(1, Math.round(banked / 60))
      : fallbackMinutes;
  // Captured before the update below clears it — this is the only place
  // that still knows which session (if any) this completion belongs to.
  const sessionGroupId = existing?.sessionGroupId ? existing.sessionGroupId.toString() : null;

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    {
      $set: {
        state: "done",
        completedAt: new Date(),
        actualMinutes,
        pausedSeconds: 0,
        sessionGroupId: null,
        formData,
        performedByUserId,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (sessionGroupId) await recordSessionCompletion(companyId, sessionGroupId, date, routineItemId, "done", actualMinutes);

  return log;
}
