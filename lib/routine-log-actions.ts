import RoutineLog from "@/models/RoutineLog";
import type { LogState } from "@/models/RoutineLog";

// Shared by app/api/routine-logs (internal, session-authenticated) and
// app/api/external/start-timer (API-key-authenticated) so both paths behave
// identically — starting a timer always goes through here.

export function minutesSince(startedAt: Date): number {
  return Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
}

export function serializeLog(l: {
  _id: { toString(): string };
  routineItemId: { toString(): string };
  date: string;
  actualMinutes?: number | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
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
    state: l.state,
    sessionGroupId: l.sessionGroupId ? l.sessionGroupId.toString() : null,
  };
}

// Starts (or restarts) a timer for routineItemId on date, enforcing a single
// active timer per user: any other in_progress log for this user — on any
// item, any date — is auto-completed first, crediting it with the elapsed
// time since its own startedAt, rather than being left dangling. Callers
// must have already called connectDB().
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
          actualMinutes: startedAt ? minutesSince(startedAt) : 1,
          sessionGroupId: null,
        },
      }
    );
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
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return log;
}
