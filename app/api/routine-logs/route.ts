import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineLog from "@/models/RoutineLog";
import type { LogState } from "@/models/RoutineLog";
import { completeInProgressLog, serializeLog, startInProgressLog, switchActiveLog } from "@/lib/routine-log-actions";
import { recordSessionCompletion } from "@/lib/routine-session-actions";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date") ?? todayString();
  await connectDB();
  const logs = await RoutineLog.find({ companyId, date }).lean();
  return NextResponse.json(logs.map(serializeLog));
}

// POST — creates or replaces a log entry.
// For state 'in_progress': delegates to startInProgressLog (see lib/routine-log-actions),
// which enforces the single-active-timer invariant server-side.
// For terminal states (done/missed/rest): sets state + actualMinutes + isBackEntry.
// Uses $set only — DO NOT put filter fields in $setOnInsert, MongoDB rejects it as
// conflicting mods and the write silently fails on the client.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId: performedByUserId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { routineItemId, date, actualMinutes, state, isBackEntry, sessionGroupId, sessionNav } = (await req.json()) as {
    routineItemId: string;
    date: string;
    actualMinutes?: number;
    state: LogState;
    isBackEntry?: boolean;
    sessionGroupId?: string | null; // set by RoutineSession to anchor this timer inside a session
    // Set by RoutineSession when moving between items (advancing or jumping).
    // Still enforces a single running timer — whatever was active gets
    // paused, banking its elapsed time — but never marks the item being left
    // done or missed the way the default sweep (startInProgressLog) does,
    // since navigating within an already-open session isn't "I've started
    // doing something else." See switchActiveLog in lib/routine-log-actions.ts.
    sessionNav?: boolean;
  };

  if (!routineItemId || !date || !state) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await connectDB();

  if (state === "in_progress") {
    const log = sessionNav
      ? await switchActiveLog(companyId, performedByUserId, routineItemId, date, sessionGroupId ?? null)
      : await startInProgressLog(companyId, performedByUserId, routineItemId, date, sessionGroupId ?? null);
    return NextResponse.json(serializeLog(log));
  }

  // A terminal state (done/missed/rest) is never session-anchored, regardless
  // of which state this log was in before — same rule PATCH enforces.
  // Read the prior sessionGroupId before the write below clears it — that's
  // the only record of which RoutineSession (if any) this completion
  // belongs to (see lib/routine-session-actions.ts). Covers RoutineSession's
  // own advance()/handleMissed/handleRest (via saveLog), which write terminal
  // states through this route rather than PATCH.
  const priorLog = await RoutineLog.findOne({ companyId, routineItemId, date }).lean();
  const priorSessionGroupId = priorLog?.sessionGroupId ? priorLog.sessionGroupId.toString() : null;

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    {
      $set: {
        state,
        actualMinutes: actualMinutes ?? null,
        isBackEntry: isBackEntry ?? false,
        sessionGroupId: null,
        pausedSeconds: 0,
        performedByUserId,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (priorSessionGroupId && (state === "done" || state === "missed" || state === "rest")) {
    await recordSessionCompletion(companyId, priorSessionGroupId, date, routineItemId, state, actualMinutes ?? 0);
  }

  return NextResponse.json(serializeLog(log));
}

// PATCH — completes or misses an existing in_progress timer log.
// For state 'done': sets completedAt = now, derives actualMinutes from startedAt.
// For state 'missed': just updates state.
export async function PATCH(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId: performedByUserId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const {
    routineItemId, date, state,
    actualMinutes: fallbackMins,
    startedAt: startOverride,
    completedAt: endOverride,
    formData,
  } = (await req.json()) as {
    routineItemId: string;
    date: string;
    state: "done" | "missed";
    actualMinutes?: number;
    startedAt?: string;   // ISO — manual time edit from client
    completedAt?: string; // ISO — manual time edit from client
    // Filled values from a form_check item's save action — see
    // components/FormCheckScreen.tsx. No validation against the item's
    // formFields shape yet — trusted as sent. Only meaningful with
    // state: "done"; ignored for "missed".
    formData?: Record<string, string | number | boolean>;
  };

  await connectDB();

  if (state === "done" && !(startOverride && endOverride)) {
    // Timer completion: derive duration from server-recorded startedAt, plus
    // any time banked from earlier paused segments of this same log — shared
    // with the external trigger-habit endpoint's complete-the-active-item half.
    const log = await completeInProgressLog(companyId, performedByUserId, routineItemId, date, fallbackMins ?? 1, formData ?? null);
    return NextResponse.json(serializeLog(log));
  }

  // Leaving a session anchor behind on the log's next state doesn't help anyone —
  // once it's no longer in_progress it should behave like any other completed log.
  // pausedSeconds only means anything while running/paused — always cleared here.
  // Read the prior sessionGroupId before it's cleared, same as POST's terminal
  // branch — this path is reached by the standalone timer's "Missed" button
  // and by a manual time-edit "done", both of which can still be session-anchored.
  const priorLog = await RoutineLog.findOne({ companyId, routineItemId, date }).lean();
  const priorSessionGroupId = priorLog?.sessionGroupId ? priorLog.sessionGroupId.toString() : null;

  const setData: Record<string, unknown> = { state, sessionGroupId: null, pausedSeconds: 0, performedByUserId };

  if (startOverride && endOverride) {
    // Manual time edit: client supplied explicit start + end in local time converted to ISO
    const start = new Date(startOverride);
    const end = new Date(endOverride);
    setData.startedAt = start;
    setData.completedAt = end;
    setData.actualMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  // A retroactive ("log with specific times") completion of a form_check
  // item still carries its captured field values — same formData shape as
  // the timer-derived completion above, just not routed through
  // completeInProgressLog since there's no in_progress log to complete.
  if (state === "done" && formData) {
    setData.formData = formData;
  }

  const log = await RoutineLog.findOneAndUpdate(
    { companyId, routineItemId, date },
    { $set: setData },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (priorSessionGroupId) {
    await recordSessionCompletion(companyId, priorSessionGroupId, date, routineItemId, state, (setData.actualMinutes as number | undefined) ?? 0);
  }

  return NextResponse.json(serializeLog(log));
}

export async function DELETE(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { routineItemId, date } = (await req.json()) as {
    routineItemId: string;
    date: string;
  };

  await connectDB();
  await RoutineLog.deleteOne({ companyId, routineItemId, date });
  return NextResponse.json({ ok: true });
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}
