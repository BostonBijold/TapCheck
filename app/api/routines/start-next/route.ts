import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import RoutineLog from "@/models/RoutineLog";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  await connectDB();

  const groups = await RoutineGroup.find({ companyId, timeOfDay: { $ne: "habit" } })
    .sort({ order: 1 }).lean();

  const groupIds = groups.map((g) => g._id);
  const [items, logs] = await Promise.all([
    RoutineItem.find({ groupId: { $in: groupIds }, companyId, isActive: true }).lean(),
    RoutineLog.find({ companyId, date }).lean(),
  ]);

  const hasLogs = logs.length > 0;

  // in_progress counts as logged — skip past it to find the next unstarted item
  const loggedIds = new Set(logs.map((l) => l.routineItemId.toString()));

  for (const group of groups) {
    const groupItems = items
      .filter((i) => i.groupId.toString() === group._id.toString())
      .sort((a, b) => a.order - b.order);
    const next = groupItems.find((i) => !loggedIds.has(i._id.toString()));
    if (next) return NextResponse.json({ hasNext: true, hasLogs });
  }

  return NextResponse.json({ hasNext: false, hasLogs });
}
