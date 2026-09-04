import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import TaskLog from "@/models/TaskLog";
import { resolveTasks } from "@/lib/task-definitions";
import { DEV_USER_ID, DEV_COMPANY_ID, DEV_LOCATION_ID } from "@/lib/session";

export const dynamic = "force-dynamic";

// Short representative cycles, repeated across the 30-day window via
// `cyclic()` below — real per-day uniqueness isn't the point, plausible
// day-to-day variance is.
function cyclic(values: number[], dayIdx: number): number {
  return values[dayIdx % values.length];
}

// Actual-minute values per Opening/Mid-Shift task — these run clean every
// day (the interesting signal is in Closing's misses/rests below), just
// with realistic minute-to-minute variance around each task's time budget.
const OPENING_ACTUALS: Record<string, number[]> = {
  "Walk-in Fridge Temp":          [2, 3, 2, 1, 2, 3, 2, 1, 2, 3],
  "Walk-in Freezer Temp":         [2, 1, 2, 3, 2, 1, 2, 3, 2, 1],
  "Handwashing Stations Stocked": [3, 4, 3, 2, 3, 4, 3, 2, 3, 4],
  "Floors & Surfaces Clean":      [5, 6, 4, 5, 7, 5, 4, 6, 5, 7],
  "Opening Cash Count":           [5, 4, 6, 5, 4, 6, 5, 4, 6, 5],
  "Staff Uniform & Hygiene":      [3, 2, 4, 3, 2, 4, 3, 2, 4, 3],
  "Opening Walkthrough":          [5, 6, 4, 5, 6, 7, 5, 4, 6, 5],
};

const MIDSHIFT_ACTUALS: Record<string, number[]> = {
  "Line Temp Check":     [3, 4, 2, 3, 4, 3, 2, 4, 3, 2],
  "Restock Check":       [5, 6, 4, 5, 7, 5, 4, 6, 5, 7],
  "Restroom Check":      [3, 2, 4, 3, 2, 4, 3, 2, 4, 3],
  "Trash & Recycling":   [5, 4, 6, 5, 4, 6, 5, 4, 6, 5],
};

// Closing task miss/rest pattern — indexed 0 (30 days ago) → 29 (today).
// "rest" here reads as "restaurant closed that day" rather than a personal
// day off, but protects the streak the same way.
const CLOSING_MISSED: Record<string, number[]> = {
  "Equipment Powered Down":         [2, 5, 9, 14, 17, 21, 25],
  "Deep Clean Kitchen":             [18],
  "Closing Cash Reconciliation":    [],
  "Trash Taken Out":                [0, 3, 6, 9, 12, 15, 18, 21, 24, 27],
  "Doors Locked / Alarm Set":       [],
  "Walk-in Fridge Temp (Close)":    [4, 11, 17, 22, 26],
  "Walk-in Freezer Temp (Close)":   [],
};

const CLOSING_REST: Record<string, number[]> = {
  "Equipment Powered Down": [26], // holiday closure
  "Trash Taken Out":        [7, 21],
};

// Actual-minute deltas from projected for Closing tasks (when done)
const CLOSING_OFFSETS: Record<string, number[]> = {
  "Equipment Powered Down":       [1, 2, 0, 3, 1, -1, 2, 1, 0, 3],
  "Deep Clean Kitchen":           [5, -2, 8, 3, -5, 5, 8, -2, 0, 5],
  "Closing Cash Reconciliation":  [2, -1, 3, 1, 0, 2, 3, -1, 1, 2],
  "Trash Taken Out":              [1, -1, 1, 2, -1, 1, 2, -1, 1, 2],
  "Doors Locked / Alarm Set":     [0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  "Walk-in Fridge Temp (Close)":  [0, 1, 0, -1, 0, 1, 0, -1, 0, 1],
  "Walk-in Freezer Temp (Close)": [0, -1, 0, 1, 0, -1, 0, 1, 0, -1],
};

function getDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export async function GET() {
  if (process.env.SKIP_AUTH !== "true") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }

  await connectDB();

  const taskLists = await TaskList.find({ companyId: DEV_COMPANY_ID }).sort({ order: 1 }).lean();
  const rawTasks  = await Task.find({ companyId: DEV_COMPANY_ID, isActive: true }).lean();
  const tasks = await resolveTasks(rawTasks);

  if (taskLists.length === 0) {
    return NextResponse.json(
      { error: "No task lists found — visit /tasks first to trigger the seed." },
      { status: 400 }
    );
  }

  const openingList = taskLists.find((tl) => tl.timeOfDay === "morning");
  const midShiftList = taskLists.find((tl) => tl.timeOfDay === "custom");
  const closingList = taskLists.find((tl) => tl.timeOfDay === "evening");

  if (!openingList || !midShiftList || !closingList) {
    return NextResponse.json({ error: "Missing Opening, Mid-Shift, or Closing task list." }, { status: 400 });
  }

  const byList = (taskListId: string) =>
    tasks.filter((t) => t.taskListId.toString() === taskListId).sort((a, b) => a.order - b.order);

  const openingTasks = byList(openingList._id.toString());
  const midShiftTasks = byList(midShiftList._id.toString());
  const closingTasks = byList(closingList._id.toString());

  // Wipe existing logs for the past 30 days so this is idempotent
  const dates = Array.from({ length: 30 }, (_, i) => getDate(29 - i));
  await TaskLog.deleteMany({ companyId: DEV_COMPANY_ID, locationId: DEV_LOCATION_ID, date: { $in: dates } });

  const logs: object[] = [];

  for (let dayIdx = 0; dayIdx < 30; dayIdx++) {
    const date = dates[dayIdx]; // dayIdx 0 = 30 days ago, 29 = today
    const isToday = dayIdx === 29;

    // ── Opening + Mid-Shift: clean every day ────────────────────────────────
    for (const [listTasks, actuals, createdAtTime] of [
      [openingTasks, OPENING_ACTUALS, "08:30:00"],
      [midShiftTasks, MIDSHIFT_ACTUALS, "13:30:00"],
    ] as const) {
      for (const task of listTasks) {
        const offsets = actuals[task.name];
        const actualMinutes = offsets ? cyclic(offsets, dayIdx) : task.projectedMinutes;

        logs.push({
          companyId: DEV_COMPANY_ID,
          locationId: DEV_LOCATION_ID,
          performedByUserId: DEV_USER_ID,
          taskId: task._id,
          date,
          state: "done",
          actualMinutes,
          isBackEntry: !isToday,
          createdAt: new Date(date + "T" + createdAtTime),
        });
      }
    }

    // ── Closing: staggered ───────────────────────────────────────────────────
    for (const task of closingTasks) {
      const missedDays = CLOSING_MISSED[task.name] ?? [];
      const restDays   = CLOSING_REST[task.name]   ?? [];

      let state: "done" | "missed" | "rest";
      if (restDays.includes(dayIdx))        state = "rest";
      else if (missedDays.includes(dayIdx)) state = "missed";
      else state = "done";

      const offsets = CLOSING_OFFSETS[task.name] ?? [];
      const actualMinutes =
        state === "done"
          ? Math.max(1, task.projectedMinutes + (offsets.length ? cyclic(offsets, dayIdx) : 0))
          : undefined;

      logs.push({
        companyId: DEV_COMPANY_ID,
        locationId: DEV_LOCATION_ID,
        performedByUserId: DEV_USER_ID,
        taskId: task._id,
        date,
        state,
        actualMinutes,
        isBackEntry: !isToday,
        createdAt: new Date(date + "T21:30:00"),
      });
    }
  }

  await TaskLog.insertMany(logs);

  const summary = {
    daysSeeded: 30,
    logsInserted: logs.length,
    opening: `${openingTasks.length} tasks — clean every day`,
    midShift: `${midShiftTasks.length} tasks — clean every day`,
    closing: {
      totalTasks: closingTasks.length,
      patterns: {
        "Equipment Powered Down":       "7 misses, 1 holiday closure",
        "Deep Clean Kitchen":           "1 miss",
        "Closing Cash Reconciliation":  "perfect",
        "Trash Taken Out":              "10 misses, 2 holiday closures",
        "Doors Locked / Alarm Set":     "perfect",
        "Walk-in Fridge Temp (Close)":  "5 misses",
        "Walk-in Freezer Temp (Close)": "perfect",
      },
    },
  };

  return NextResponse.json(summary);
}
