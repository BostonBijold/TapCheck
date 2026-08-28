import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { calendarWeekDates } from "@/lib/week-dates";
import { computeWeeklyProgress } from "@/lib/task-progress";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import TaskLog from "@/models/TaskLog";

// anchorDate: client's local today (YYYY-MM-DD). Never derive from server UTC.
// The 7-day view is a fixed Sunday–Saturday calendar week containing
// anchorDate — it can include days after anchorDate (later this week), which
// the client renders as a distinct pending state. The 30-day view stays a
// trailing window ending at anchorDate, which by construction never
// includes a future date.
function getDates(days: number, anchorDate: string): string[] {
  if (days === 7) return calendarWeekDates(anchorDate);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(anchorDate + "T12:00:00");
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().split("T")[0];
  });
}

export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const days = Math.min(30, Math.max(7, parseInt(searchParams.get("days") ?? "7")));
  // Client must send its local date so date windows match stored local-date strings
  const localDate = searchParams.get("localDate") ?? new Date().toISOString().split("T")[0];
  const dates = getDates(days, localDate);
  // Days later this week that haven't happened yet still appear in `dates`
  // (for a consistent chart width) but can't have logs — exclude them from
  // "how many days could this have been logged" denominators below.
  const elapsedDates = dates.filter((d) => d <= localDate);

  await connectDB();

  const taskLists = await TaskList.find({ companyId }).sort({ order: 1 }).lean();
  const allTasks = await Task.find({ companyId, isActive: true }).lean();
  const logs = await TaskLog.find({ companyId, date: { $in: dates } }).lean();

  // Fast lookup: taskId → date → log
  const logMap: Record<string, Record<string, (typeof logs)[0]>> = {};
  for (const log of logs) {
    const id = log.taskId.toString();
    if (!logMap[id]) logMap[id] = {};
    logMap[id][log.date] = log;
  }

  const taskListOrderMap: Record<string, number> = {};
  taskLists.forEach((tl, i) => { taskListOrderMap[tl._id.toString()] = i; });

  // Sort tasks by list order then task order
  const sortedTasks = [...allTasks].sort((a, b) => {
    const lo = (taskListOrderMap[a.taskListId.toString()] ?? 99) - (taskListOrderMap[b.taskListId.toString()] ?? 99);
    return lo !== 0 ? lo : a.order - b.order;
  });

  // ── Per-list task ID sets (for start-time attribution) ───────────────────
  const taskListTaskIds: Record<string, Set<string>> = {};
  for (const task of sortedTasks) {
    const lId = task.taskListId.toString();
    if (!taskListTaskIds[lId]) taskListTaskIds[lId] = new Set();
    taskListTaskIds[lId].add(task._id.toString());
  }

  // ── Typical start time ────────────────────────────────────────────────────
  // For each list, find the earliest startedAt per day, then average those.
  // This answers "what time do you usually begin this task list."
  // startedAt is a UTC Date; return avgMinutesUtc so the client can convert to
  // local time using the browser's own timezone offset.
  const taskListEarliestByDay: Record<string, Record<string, number>> = {};

  for (const log of logs) {
    if (!log.startedAt) continue;
    const taskId = log.taskId.toString();
    const utcMins =
      new Date(log.startedAt).getUTCHours() * 60 +
      new Date(log.startedAt).getUTCMinutes();

    for (const [lId, taskIdSet] of Object.entries(taskListTaskIds)) {
      if (!taskIdSet.has(taskId)) continue;
      if (!taskListEarliestByDay[lId]) taskListEarliestByDay[lId] = {};
      const prev = taskListEarliestByDay[lId][log.date];
      if (prev === undefined || utcMins < prev) {
        taskListEarliestByDay[lId][log.date] = utcMins;
      }
    }
  }

  const taskListAvgStart: Record<string, { avgMinutesUtc: number; sampleSize: number }> = {};
  for (const [lId, byDay] of Object.entries(taskListEarliestByDay)) {
    const times = Object.values(byDay);
    if (times.length > 0) {
      taskListAvgStart[lId] = {
        avgMinutesUtc: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
        sampleSize: times.length,
      };
    }
  }

  // ── Task-list-level stats ──────────────────────────────────────────────────
  const taskListStats = taskLists.map((taskList) => {
    const lId = taskList._id.toString();
    const tasks = sortedTasks.filter((t) => t.taskListId.toString() === lId);
    const totalTasks = tasks.length;

    const daily = dates.map((date) => {
      let doneCount = 0, missedCount = 0, restCount = 0, actualMins = 0;
      const projectedMins = tasks.reduce((s, t) => s + t.projectedMinutes, 0);
      for (const task of tasks) {
        const log = logMap[task._id.toString()]?.[date];
        if (!log) continue;
        if (log.state === "done") { doneCount++; actualMins += log.actualMinutes ?? 0; }
        else if (log.state === "missed") missedCount++;
        else if (log.state === "rest") restCount++;
      }
      return { date, doneCount, missedCount, restCount, loggedCount: doneCount + missedCount + restCount, projectedMins, actualMins };
    });

    const activeDays = daily.filter((d) => d.loggedCount > 0);
    const avgCompletionRate =
      activeDays.length > 0
        ? activeDays.reduce((s, d) => s + d.doneCount / Math.max(totalTasks, 1), 0) / activeDays.length
        : 0;
    const avgActualMins =
      activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + d.actualMins, 0) / activeDays.length)
        : 0;
    const totalProjectedMins = tasks.reduce((s, t) => s + t.projectedMinutes, 0);
    const startInfo = taskListAvgStart[lId] ?? null;

    return {
      _id: lId,
      name: taskList.name,
      totalTasks,
      daily,
      avgCompletionRate,
      avgActualMins,
      totalProjectedMins,
      avgStartMinutesUtc: startInfo?.avgMinutesUtc ?? null,
      startTimeSampleSize: startInfo?.sampleSize ?? 0,
    };
  });

  // ── Task-level stats ──────────────────────────────────────────────────────
  const taskListNameMap = Object.fromEntries(taskLists.map((tl) => [tl._id.toString(), tl.name]));

  const taskStats = sortedTasks.map((task) => {
    const taskId = task._id.toString();
    const daily = dates.map((date) => {
      const log = logMap[taskId]?.[date];
      return {
        date,
        state: (log?.state ?? null) as "done" | "missed" | "rest" | null,
        actualMinutes: (log?.actualMinutes ?? null) as number | null,
      };
    });

    const doneDays = daily.filter((d) => d.state === "done");
    const doneCount = doneDays.length;
    const missedCount = daily.filter((d) => d.state === "missed").length;
    const restCount = daily.filter((d) => d.state === "rest").length;

    const isCheckbox = task.taskType === "checkbox";
    const isStopwatch = task.taskType === "stopwatch";
    const avgActualMins =
      !isCheckbox && doneDays.length > 0
        ? Math.round(doneDays.reduce((s, d) => s + (d.actualMinutes ?? task.projectedMinutes), 0) / doneDays.length)
        : null;
    const avgVariance = avgActualMins !== null && !isStopwatch ? avgActualMins - task.projectedMinutes : null;

    const engagedDays = doneCount + missedCount;

    // Only meaningful against a *weekly* threshold — omitted for the 30-day
    // trailing view, which has no clean interpretation against one week's
    // schedule. `dates`/`localDate` are already the Sun–Sat week + its
    // anchor when days === 7 (see getDates above).
    const scheduledDays = task.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
    const successThreshold = task.successThreshold ?? scheduledDays.length;
    // No real time target for checkbox/stopwatch tasks — timing color is
    // always null for those regardless of actualMinutes (see task-progress.ts).
    const targetMinutes = !isCheckbox && !isStopwatch ? task.projectedMinutes : null;
    const weeklyLogsByDate: Record<string, { state: "done" | "missed" | "rest"; actualMinutes: number | null }> = {};
    for (const date of dates) {
      const log = logMap[taskId]?.[date];
      if (log?.state === "done" || log?.state === "missed" || log?.state === "rest") {
        weeklyLogsByDate[date] = { state: log.state, actualMinutes: log.actualMinutes ?? null };
      }
    }
    const weeklyProgress = days === 7
      ? computeWeeklyProgress(scheduledDays, successThreshold, weeklyLogsByDate, dates, localDate, targetMinutes)
      : undefined;

    return {
      _id: taskId,
      name: task.name,
      icon: task.icon,
      taskListId: task.taskListId.toString(),
      taskListName: taskListNameMap[task.taskListId.toString()] ?? "",
      projectedMinutes: task.projectedMinutes,
      daily,
      doneCount,
      missedCount,
      restCount,
      unloggedCount: elapsedDates.length - doneCount - missedCount - restCount,
      avgActualMins,
      avgVariance,
      weeklyProgress,
      completionRate: engagedDays > 0 ? doneCount / engagedDays : 0,
      engagedDays,
      totalDays: elapsedDates.length,
      taskType: (task.taskType ?? "standard") as string,
    };
  });

  return NextResponse.json({ dates, days, today: localDate, taskLists: taskListStats, tasks: taskStats });
}
