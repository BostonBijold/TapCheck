import Task from "@/models/Task";
import TaskLog from "@/models/TaskLog";
import { isTaskVisibleOn } from "@/lib/task-visibility";

// "Current streak" for the Reports employee summary strip — counts
// consecutive days, walking backward, where every one of the company's
// active tasks scheduled on that weekday has a done log from this
// specific person. A day with zero scheduled tasks is skipped over (doesn't
// count, doesn't break the streak). Task has no assignee concept — any
// employee can complete any task (see models/Task.ts) — so this
// deliberately checks the FULL active task catalog against this one
// person's logs, the same "denominator is the schedule, not who logged it"
// philosophy the role-scoped Reports Overview already uses. That means an
// employee's streak can legitimately break because a teammate (not them)
// left a shift-shared task unlogged — a known, accepted quirk, not a bug.

function prevDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function isDayAllClear(
  tasks: Array<{ _id: string; scheduledDays?: number[] }>,
  logsByDateAndTask: Record<string, Record<string, { state: string } | undefined>>,
  dateStr: string
): { allClear: boolean; hasScheduledTasks: boolean } {
  const scheduledToday = tasks.filter((t) => isTaskVisibleOn(t, dateStr));
  if (scheduledToday.length === 0) return { allClear: true, hasScheduledTasks: false };
  const allClear = scheduledToday.every((t) => {
    const log = logsByDateAndTask[dateStr]?.[t._id];
    return log?.state === "done";
  });
  return { allClear, hasScheduledTasks: true };
}

// Pure core — no DB access, safe to unit test directly.
export function computeCurrentStreak(
  tasks: Array<{ _id: string; scheduledDays?: number[] }>,
  logsByDateAndTask: Record<string, Record<string, { state: string } | undefined>>,
  startDate: string,
  maxLookbackDays = 365
): number {
  let streak = 0;
  let cursor = startDate;
  for (let i = 0; i < maxLookbackDays; i++) {
    const { allClear, hasScheduledTasks } = isDayAllClear(tasks, logsByDateAndTask, cursor);
    if (!hasScheduledTasks) {
      cursor = prevDate(cursor);
      continue;
    }
    if (!allClear) break;
    streak++;
    cursor = prevDate(cursor);
  }
  return streak;
}

// DB-fetching wrapper. `today` is the client's local YYYY-MM-DD. If today
// still has an unresolved scheduled task (the day "isn't over yet"), count
// backward starting from yesterday instead — an in-progress day shouldn't
// prematurely break the streak just because it isn't finished.
export async function computeCurrentStreakForUser(
  companyId: string,
  userId: string,
  today: string,
  maxLookbackDays = 365
): Promise<number> {
  const rawTasks = await Task.find({ companyId, isActive: true }, "_id scheduledDays").lean();
  const tasks = rawTasks.map((t) => ({ _id: t._id.toString(), scheduledDays: t.scheduledDays }));

  const earliestNeeded = new Date(today + "T12:00:00");
  earliestNeeded.setDate(earliestNeeded.getDate() - maxLookbackDays);
  const startBound = earliestNeeded.toISOString().split("T")[0];

  const logs = await TaskLog.find({
    companyId,
    performedByUserId: userId,
    date: { $gte: startBound, $lte: today },
  }, "taskId date state").lean();

  const logsByDateAndTask: Record<string, Record<string, { state: string } | undefined>> = {};
  for (const log of logs) {
    const d = log.date;
    const t = log.taskId.toString();
    (logsByDateAndTask[d] ??= {})[t] = { state: log.state };
  }

  const { allClear: todayAllClear } = isDayAllClear(tasks, logsByDateAndTask, today);
  const startDate = todayAllClear ? today : prevDate(today);

  return computeCurrentStreak(tasks, logsByDateAndTask, startDate, maxLookbackDays);
}
