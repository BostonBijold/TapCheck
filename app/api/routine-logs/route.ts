import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineLog from "@/models/RoutineLog";
import type { LogState } from "@/models/RoutineLog";
import { minutesSince, serializeLog, startInProgressLog, switchActiveLog } from "@/lib/routine-log-actions";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string): string | null {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? todayString();
  await connectDB();
  const logs = await RoutineLog.find({ userId, date }).lean();
  return NextResponse.json(logs.map(serializeLog));
}

// POST — creates or replaces a log entry.
// For state 'in_progress': delegates to startInProgressLog (see lib/routine-log-actions),
// which enforces the single-active-timer invariant server-side.
// For terminal states (done/missed/rest): sets state + actualMinutes + isBackEntry.
// Uses $set only — DO NOT put filter fields in $setOnInsert, MongoDB rejects it as
// conflicting mods and the write silently fails on the client.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      ? await switchActiveLog(userId, routineItemId, date, sessionGroupId ?? null)
      : await startInProgressLog(userId, routineItemId, date, sessionGroupId ?? null);
    return NextResponse.json(serializeLog(log));
  }

  // A terminal state (done/missed/rest) is never session-anchored, regardless
  // of which state this log was in before — same rule PATCH enforces.
  const log = await RoutineLog.findOneAndUpdate(
    { userId, routineItemId, date },
    { $set: { state, actualMinutes: actualMinutes ?? null, isBackEntry: isBackEntry ?? false, sessionGroupId: null, pausedSeconds: 0 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return NextResponse.json(serializeLog(log));
}

// PATCH — completes or misses an existing in_progress timer log.
// For state 'done': sets completedAt = now, derives actualMinutes from startedAt.
// For state 'missed': just updates state.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    routineItemId, date, state,
    actualMinutes: fallbackMins,
    startedAt: startOverride,
    completedAt: endOverride,
  } = (await req.json()) as {
    routineItemId: string;
    date: string;
    state: "done" | "missed";
    actualMinutes?: number;
    startedAt?: string;   // ISO — manual time edit from client
    completedAt?: string; // ISO — manual time edit from client
  };

  await connectDB();

  const now = new Date();
  // Leaving a session anchor behind on the log's next state doesn't help anyone —
  // once it's no longer in_progress it should behave like any other completed log.
  // pausedSeconds only means anything while running/paused — always cleared here.
  const setData: Record<string, unknown> = { state, sessionGroupId: null, pausedSeconds: 0 };

  if (startOverride && endOverride) {
    // Manual time edit: client supplied explicit start + end in local time converted to ISO
    const start = new Date(startOverride);
    const end = new Date(endOverride);
    setData.startedAt = start;
    setData.completedAt = end;
    setData.actualMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  } else if (state === "done") {
    // Timer completion: derive duration from server-recorded startedAt, plus
    // any time banked from earlier paused segments of this same log.
    setData.completedAt = now;
    const existing = await RoutineLog.findOne({ userId, routineItemId, date }).lean();
    const startedAt = existing?.startedAt ? new Date(existing.startedAt) : null;
    const banked = existing?.pausedSeconds ?? 0;
    setData.actualMinutes = startedAt
      ? minutesSince(startedAt, banked)
      : banked > 0
        ? Math.max(1, Math.round(banked / 60))
        : (fallbackMins ?? 1);
  }

  const log = await RoutineLog.findOneAndUpdate(
    { userId, routineItemId, date },
    { $set: setData },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return NextResponse.json(serializeLog(log));
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { routineItemId, date } = (await req.json()) as {
    routineItemId: string;
    date: string;
  };

  await connectDB();
  await RoutineLog.deleteOne({ userId, routineItemId, date });
  return NextResponse.json({ ok: true });
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}
