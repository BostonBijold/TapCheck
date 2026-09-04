import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskLog from "@/models/TaskLog";
import type { LogState } from "@/models/TaskLog";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";
import User from "@/models/User";
import { resolveTasks } from "@/lib/task-definitions";
import { resolveSessionUser, pickActiveLocationId } from "@/lib/session";
import { validateLocationId } from "@/lib/locations";

export const dynamic = "force-dynamic";

// GET /api/task-logs/history — the Reports "Logs" tab's chronological,
// filterable history. Distinct from GET /api/task-logs (a single day,
// company-wide, built for "what happened today" screens) — this is a
// date-RANGE, paginated, denormalized query built for history browsing.
// See docs/features/reports.md.
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 });
  }

  const requestedUserId = searchParams.get("userId");
  const taskListId = searchParams.get("taskListId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));

  await connectDB();

  // Same location-scoping convention as GET /api/task-logs — an owner may
  // pass ?locationId=<id> to browse a specific store's history (validated
  // against their own company); an employee/manager always sees only their
  // own. See docs/features/locations.md.
  const requestedLocationId = await validateLocationId(companyId, searchParams.get("locationId"));
  const locationId = pickActiveLocationId(sessionUser, requestedLocationId);

  const logFilter: Record<string, unknown> = { companyId, locationId, date: { $gte: startDate, $lte: endDate } };
  if (role === "employee") {
    // Always self — an employee can never see a teammate's history, even if
    // they hand-append ?userId=<someone-else> to the request themselves.
    logFilter.performedByUserId = userId;
  } else if (requestedUserId) {
    // Manager viewing one specific teammate's history.
    logFilter.performedByUserId = requestedUserId;
  }
  // Manager + no requestedUserId → no performedByUserId filter at all —
  // company-wide, every employee's logs, matching the existing Overview's
  // manager-wide default.

  if (taskListId) {
    // TaskLog has no taskListId of its own — the join is TaskLog.taskId →
    // Task.taskListId, so resolve to a taskId set first (same pattern
    // app/api/reports/route.ts uses for its per-list start-time attribution).
    const tasksInList = await Task.find({ companyId, taskListId }, "_id").lean();
    logFilter.taskId = { $in: tasksInList.map((t) => t._id) };
  }

  const totalCount = await TaskLog.countDocuments(logFilter);
  // Grouping by date desc first, then completedAt/startedAt/createdAt desc
  // as tiebreakers, gives "most recent first" including logs with no
  // completedAt (missed/rest) without needing a computed sort key.
  const rawLogs = await TaskLog.find(logFilter)
    .sort({ date: -1, completedAt: -1, startedAt: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // ── Batch denormalization — 3 extra queries regardless of page size ──────
  const taskIds = Array.from(new Set(rawLogs.map((l) => l.taskId.toString())));
  const rawTasks = taskIds.length > 0
    ? await Task.find({ _id: { $in: taskIds } }).lean()
    : [];
  const resolvedTasks = await resolveTasks(rawTasks);
  const taskById = new Map(resolvedTasks.map((t) => [t._id.toString(), t]));

  const taskListIds = Array.from(new Set(resolvedTasks.map((t) => t.taskListId.toString())));
  const taskLists = taskListIds.length > 0
    ? await TaskList.find({ _id: { $in: taskListIds } }, "name").lean()
    : [];
  const taskListNameById = new Map(taskLists.map((tl) => [tl._id.toString(), tl.name]));

  const performerIds = Array.from(new Set(rawLogs.map((l) => l.performedByUserId)))
    .filter((id) => mongoose.isValidObjectId(id)); // excludes SKIP_AUTH's non-ObjectId dev sentinel
  const performers = performerIds.length > 0
    ? await User.find({ _id: { $in: performerIds } }, "name").lean()
    : [];
  const performerNameById = new Map(performers.map((u) => [u._id.toString(), u.name ?? "Unknown"]));

  const logs = rawLogs.map((log) => {
    const taskId = log.taskId.toString();
    const task = taskById.get(taskId);
    return {
      _id: log._id.toString(),
      date: log.date,
      state: log.state as LogState,
      actualMinutes: log.actualMinutes ?? null,
      completedAt: log.completedAt ? new Date(log.completedAt).toISOString() : null,
      startedAt: log.startedAt ? new Date(log.startedAt).toISOString() : null,
      taskId,
      taskName: task?.name ?? "Deleted task",
      taskIcon: task?.icon ?? "help-circle",
      taskType: task?.taskType ?? "form",
      taskListId: task?.taskListId ? task.taskListId.toString() : "",
      taskListName: task?.taskListId ? taskListNameById.get(task.taskListId.toString()) ?? "" : "",
      performedByUserId: log.performedByUserId,
      performedByName: performerNameById.get(log.performedByUserId) ?? "Unknown",
      note: log.note ?? null,
      isBackEntry: log.isBackEntry ?? false,
    };
  });

  return NextResponse.json({
    logs,
    page,
    limit,
    hasMore: page * limit < totalCount,
    totalCount,
  });
}
