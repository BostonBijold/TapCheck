import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineLog from "@/models/RoutineLog";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string): string | null {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// The user's single active timer, if any — used by the FAB to switch into
// its resume state. Only one log is ever in_progress at a time (jumping to a
// different item inside a Routine Session pauses whatever was running
// instead of leaving it in_progress — see switchActiveLog in
// lib/routine-log-actions.ts), but sort defensively in case more than one
// ever exists transiently.
export async function GET() {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const log = await RoutineLog.findOne({ userId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();
  if (!log?.startedAt) {
    return NextResponse.json({ active: false });
  }

  const item = await RoutineItem.findOne({ _id: log.routineItemId, userId }).lean();
  if (!item) {
    // Dangling log pointing at a deleted item — nothing sensible to resume.
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    routineItemId: log.routineItemId.toString(),
    date: log.date,
    startedAt: new Date(log.startedAt).toISOString(),
    pausedSeconds: log.pausedSeconds ?? 0,
    itemName: item.name,
    itemIcon: item.icon,
    itemType: item.itemType,
    projectedMinutes: item.projectedMinutes,
  });
}
