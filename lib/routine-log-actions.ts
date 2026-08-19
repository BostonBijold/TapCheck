import RoutineLog from "@/models/RoutineLog";
import type { LogState } from "@/models/RoutineLog";

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
  };
}

// Starts (or restarts) a timer for routineItemId on date, enforcing a single
// active timer per user: any other in_progress log for this user — on any
// item, any date — is auto-completed first, crediting it with the elapsed
// time since its own startedAt, rather than being left dangling. Used by the
// external API and by starting a habit's standalone timer — both mean "I've
// actually moved on to doing something else," unlike navigating inside an
// already-open Routine Session (see switchActiveLog below). Callers must
// have already called connectDB().
//
// sessionGroupId, when set, marks this timer as anchored inside a Routine
// Session for that group — see models/RoutineLog.ts.
export async function startInProgressLog(
  userId: string,
  routineItemId: string,
  date: string,
  sessionGroupId: string | null = null
) {
  const stray = await RoutineLog.find({
    userId,
    state: "in_progress",
    routineItemId: { $ne: routineItemId },
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

  const existing = await RoutineLog.findOne({ userId, routineItemId, date }).lean();

  const log = await RoutineLog.findOneAndUpdate(
    { userId, routineItemId, date },
    {
      $set: {
        state: "in_progress",
        startedAt: new Date(),
        completedAt: null,
        actualMinutes: null,
        isBackEntry: false,
        sessionGroupId,
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
  userId: string,
  routineItemId: string,
  date: string,
  sessionGroupId: string | null
) {
  const others = await RoutineLog.find({
    userId,
    state: "in_progress",
    routineItemId: { $ne: routineItemId },
  }).lean();

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

  const existing = await RoutineLog.findOne({ userId, routineItemId, date }).lean();
  if (existing?.state === "in_progress") {
    return existing;
  }

  const log = await RoutineLog.findOneAndUpdate(
    { userId, routineItemId, date },
    {
      $set: {
        state: "in_progress",
        startedAt: new Date(),
        completedAt: null,
        actualMinutes: null,
        isBackEntry: false,
        sessionGroupId,
        pausedSeconds: existing?.state === "paused" ? (existing.pausedSeconds ?? 0) : 0,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return log;
}
