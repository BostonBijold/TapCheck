import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findUserIdByApiKey } from "@/lib/api-key";
import {
  completeInProgressLog,
  serializeLog,
  startImmediateLog,
  startInProgressLog,
} from "@/lib/routine-log-actions";
import { findNextItemInGroup, incrementSessionPauseOrJump } from "@/lib/routine-session-actions";
import RoutineItem from "@/models/RoutineItem";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineLog from "@/models/RoutineLog";
import type { ItemType } from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

// External trigger — same API-key auth as /api/external/start-timer, meant
// to be fired from a single iPhone Shortcut (NFC tap or manual run) that
// doesn't know or care whether it's starting or finishing something.
//
// Bidirectional: whether this call starts or completes a habit is decided
// entirely by current server state (is there an active timer, and does it
// match the tapped item), never by a param the caller sends. See
// docs/api/external-api.md for the full case breakdown.
//
// Items with no timer (checkbox, virtue_checkin, weekly_review) never pass
// through an in_progress state at all — "starting" one just writes a
// terminal done log immediately (startImmediateLog), zero minutes.
function todayString() {
  return new Date().toISOString().split("T")[0];
}

function readParam(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
  key: string
): string | null {
  const fromBody = body[key];
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return searchParams.get(key);
}

function isTimerItem(itemType: ItemType): boolean {
  return itemType === "standard" || itemType === "stopwatch";
}

// Starts routineItemId per Case 1's rules: standard/stopwatch → in_progress
// timer (sessionGroupId anchored if groupId given), anything else →
// immediate zero-minute done log. Both halves enforce the single-active-
// timer sweep internally (startInProgressLog / startImmediateLog).
async function startItem(
  userId: string,
  itemType: ItemType,
  routineItemId: string,
  date: string,
  groupId: string | null
) {
  return isTimerItem(itemType)
    ? startInProgressLog(userId, routineItemId, date, groupId)
    : startImmediateLog(userId, routineItemId, date, groupId);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No/invalid JSON body — fine, fall back to query params below.
  }

  const apiKey =
    req.headers.get("x-api-key") || readParam(body, req.nextUrl.searchParams, "apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const userId = await findUserIdByApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const routineItemId = readParam(body, req.nextUrl.searchParams, "routineItemId");
  if (!routineItemId) {
    return NextResponse.json({ error: "Missing routineItemId" }, { status: 400 });
  }
  const routineGroupId = readParam(body, req.nextUrl.searchParams, "routineGroupId");
  const date = readParam(body, req.nextUrl.searchParams, "date") || todayString();

  let item;
  try {
    item = await RoutineItem.findOne({ _id: routineItemId, userId, isActive: true }).lean();
  } catch {
    return NextResponse.json({ error: "Invalid routineItemId" }, { status: 400 });
  }
  if (!item) {
    return NextResponse.json({ error: "Routine item not found" }, { status: 404 });
  }

  if (routineGroupId) {
    let group;
    try {
      group = await RoutineGroup.findOne({ _id: routineGroupId, userId }).lean();
    } catch {
      return NextResponse.json({ error: "Invalid routineGroupId" }, { status: 400 });
    }
    if (!group) {
      return NextResponse.json({ error: "Routine group not found" }, { status: 404 });
    }
    if (item.groupId.toString() !== routineGroupId) {
      return NextResponse.json({ error: "Item does not belong to that group" }, { status: 400 });
    }
  }

  // Only one log is ever in_progress at a time by invariant, but sort
  // defensively in case more than one ever exists transiently — same
  // defensiveness as GET /api/routine-logs/active.
  const activeLog = await RoutineLog.findOne({ userId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();

  let completed = null;
  let started = null;

  if (activeLog && activeLog.routineItemId.toString() === routineItemId) {
    // Case 2 — tapped item is the currently active one: complete it.
    const completedLog = await completeInProgressLog(userId, routineItemId, activeLog.date);
    completed = serializeLog(completedLog);

    if (routineGroupId) {
      const next = await findNextItemInGroup(userId, routineGroupId, activeLog.date);
      if (next) {
        const startedLog = await startItem(
          userId,
          next.itemType,
          next._id.toString(),
          activeLog.date,
          routineGroupId
        );
        started = serializeLog(startedLog);
      }
    }
  } else if (activeLog) {
    // Case 3 — a different item is active: complete it, then start the
    // tapped item (jump case — lands wherever was tapped, not the next in
    // sequence), passing routineGroupId through regardless of whether it
    // was supplied on this call for the completed item or not.
    const otherItemId = activeLog.routineItemId.toString();
    const otherSessionGroupId = activeLog.sessionGroupId ? activeLog.sessionGroupId.toString() : null;
    const completedLog = await completeInProgressLog(userId, otherItemId, activeLog.date);
    completed = serializeLog(completedLog);
    // This is the jump this counter exists for — attention moved to a
    // different item without the one that was running getting marked done
    // by the user themselves. Counted against the session the left-behind
    // item belonged to (see lib/routine-session-actions.ts).
    if (otherSessionGroupId) await incrementSessionPauseOrJump(userId, otherSessionGroupId, activeLog.date);

    const startedLog = await startItem(userId, item.itemType, routineItemId, date, routineGroupId);
    started = serializeLog(startedLog);
  } else {
    // Case 1 — nothing active anywhere: start the tapped item.
    const startedLog = await startItem(userId, item.itemType, routineItemId, date, routineGroupId);
    started = serializeLog(startedLog);
  }

  return NextResponse.json({ ok: true, completed, started });
}
