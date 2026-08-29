import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import { resolveTasks } from "@/lib/task-definitions";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const taskLists = await TaskList.find({ companyId, isActive: true }).sort({ order: 1 }).lean();

  const taskListsWithTasks = await Promise.all(
    taskLists.map(async (taskList) => {
      const rawTasks = await Task.find({
        taskListId: taskList._id,
        companyId,
        isActive: true,
      })
        .sort({ order: 1 })
        .lean();
      const tasks = await resolveTasks(rawTasks);

      return {
        _id: taskList._id.toString(),
        name: taskList.name,
        timeOfDay: taskList.timeOfDay,
        order: taskList.order,
        tasks: tasks.map((task) => ({
          _id: task._id.toString(),
          name: task.name,
          icon: task.icon,
          projectedMinutes: task.projectedMinutes,
          order: task.order,
        })),
      };
    })
  );

  return NextResponse.json(taskListsWithTasks);
}

// POST /api/task-lists — a manager creates a new task list (name + start
// time). Its tasks are added afterward through POST /api/tasks, same flow
// used for any other task list (browse the template catalog or build a
// custom task) — see components/AddTaskSheet.tsx.
export async function POST(req: Request) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { name, startTime, scheduledDays } = (await req.json()) as {
    name?: string;
    startTime?: string | null;
    scheduledDays?: number[];
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  await connectDB();

  const topList = await TaskList.findOne({ companyId }).sort({ order: -1 }).lean();
  const nextOrder = topList ? topList.order + 1 : 0;
  const days = Array.isArray(scheduledDays) && scheduledDays.length > 0 ? scheduledDays : [0, 1, 2, 3, 4, 5, 6];

  const taskList = await TaskList.create({
    companyId,
    name: name.trim(),
    // A manager-created list is a free-form "custom" window, same as any
    // other non-seeded shift — it participates in the same time-aware
    // collapse math as Opening/Mid-Shift/Closing when it has a startTime,
    // and behaves like a standalone (never-collapsing) list when it doesn't.
    timeOfDay: startTime ? "custom" : "anytime",
    startTime: startTime || null,
    order: nextOrder,
    isDefault: false,
    scheduledDays: days,
  });

  return NextResponse.json({
    _id: taskList._id.toString(),
    name: taskList.name,
    timeOfDay: taskList.timeOfDay,
    startTime: taskList.startTime ?? null,
    order: taskList.order,
    scheduledDays: taskList.scheduledDays,
  });
}
