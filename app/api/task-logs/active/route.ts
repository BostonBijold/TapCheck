import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskLog from "@/models/TaskLog";
import Task from "@/models/Task";
import { resolveTask } from "@/lib/task-definitions";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The signed-in person's single active timer, if any — used by the FAB to
// switch into its resume state. Only one log is ever in_progress per person
// at a time (jumping to a different task inside a Task List Session pauses
// whatever was running instead of leaving it in_progress — see
// switchActiveLog in lib/task-log-actions.ts), but sort defensively in case
// more than one ever exists transiently.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId: performedByUserId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const log = await TaskLog.findOne({ companyId, performedByUserId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();
  if (!log?.startedAt) {
    return NextResponse.json({ active: false });
  }

  const rawTask = await Task.findOne({ _id: log.taskId, companyId }).lean();
  if (!rawTask) {
    // Dangling log pointing at a deleted task — nothing sensible to resume.
    return NextResponse.json({ active: false });
  }
  const task = await resolveTask(rawTask);

  return NextResponse.json({
    active: true,
    taskId: log.taskId.toString(),
    date: log.date,
    startedAt: new Date(log.startedAt).toISOString(),
    pausedSeconds: log.pausedSeconds ?? 0,
    taskName: task.name,
    taskIcon: task.icon,
    taskType: task.taskType,
    projectedMinutes: task.projectedMinutes,
  });
}
