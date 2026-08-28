import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineLog from "@/models/RoutineLog";
import RoutineItem from "@/models/RoutineItem";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The signed-in person's single active timer, if any — used by the FAB to
// switch into its resume state. Only one log is ever in_progress per person
// at a time (jumping to a different item inside a Routine Session pauses
// whatever was running instead of leaving it in_progress — see
// switchActiveLog in lib/routine-log-actions.ts), but sort defensively in
// case more than one ever exists transiently.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId: performedByUserId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const log = await RoutineLog.findOne({ companyId, performedByUserId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();
  if (!log?.startedAt) {
    return NextResponse.json({ active: false });
  }

  const item = await RoutineItem.findOne({ _id: log.routineItemId, companyId }).lean();
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
