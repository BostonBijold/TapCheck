import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import TaskLog from "@/models/TaskLog";
import Todo, { serializeTodo, todosForDateQuery } from "@/models/Todo";
import { seedDefaultTaskLists, ensureAnytimeTaskList } from "@/lib/seed";
import { calendarWeekDates } from "@/lib/week-dates";
import TasksView from "@/components/TasksView";
import type { LogState } from "@/models/TaskLog";
import { resolveSessionUser } from "@/lib/session";
import NoCompanyMessage from "@/components/NoCompanyMessage";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: { startNext?: string; addTask?: string; date?: string; resumeTimer?: string; openTaskId?: string; verifiedNfcUid?: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();

  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId, userId, role } = sessionUser;

  const userName = session?.user?.name ?? "Developer";

  if (!companyId) {
    return <NoCompanyMessage userName={userName} />;
  }

  await connectDB();

  // First-time seeds — per company, not per user: the first employee or
  // manager of a newly-attached company to load this page seeds its default
  // task lists.
  const taskListCount = await TaskList.countDocuments({ companyId });
  if (taskListCount === 0) await seedDefaultTaskLists(companyId);
  await ensureAnytimeTaskList(companyId);

  // Always trust the client-supplied date (local timezone).
  // Never fall back to server UTC — the server doesn't know the user's timezone.
  // The client-side useEffect in TasksView will redirect with ?date= on first load.
  const today = searchParams?.date ?? new Date().toISOString().split("T")[0];
  const weekDates = calendarWeekDates(today);

  const taskLists = await TaskList.find({ companyId, isActive: true }).sort({ order: 1 }).lean();

  // Single query for every list's tasks instead of one query per list — the
  // result is already sorted by order, so grouping it in memory below
  // preserves each list's task order exactly as the old per-list query did.
  const allTasks = await Task.find({
    taskListId: { $in: taskLists.map((tl) => tl._id) },
    companyId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  const tasksByTaskListId = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    const key = task.taskListId.toString();
    const list = tasksByTaskListId.get(key);
    if (list) list.push(task);
    else tasksByTaskListId.set(key, [task]);
  }

  const taskListsWithTasks = taskLists.map((taskList) => {
    const tasks = tasksByTaskListId.get(taskList._id.toString()) ?? [];
    return {
      _id: taskList._id.toString(),
      name: taskList.name,
      timeOfDay: taskList.timeOfDay as "morning" | "evening" | "custom" | "anytime",
      startTime: taskList.startTime ?? null,
      order: taskList.order,
      tasks: tasks.map((task) => ({
        _id: task._id.toString(),
        name: task.name,
        icon: task.icon,
        projectedMinutes: task.projectedMinutes,
        order: task.order,
        taskType: task.taskType,
        // Existing documents predate these fields — Mongoose defaults only
        // apply on create, so a .lean() read can come back undefined.
        scheduledDays: task.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
        successThreshold: task.successThreshold ?? (task.scheduledDays?.length ?? 7),
        formFields: task.formFields ?? [],
        nfcTagUid: task.nfcTagUid ?? null,
      })),
    };
  });

  // Today's logs for initial state — company-wide, since any employee's
  // completion of a shared task should show up for everyone.
  const todayLogs = await TaskLog.find({ companyId, date: today }).lean();
  const initialLogs = todayLogs.map((l) => ({
    _id: l._id.toString(),
    taskId: l.taskId.toString(),
    date: l.date,
    actualMinutes: l.actualMinutes ?? undefined,
    startedAt: l.startedAt ? (l.startedAt as Date).toISOString() : undefined,
    completedAt: l.completedAt ? (l.completedAt as Date).toISOString() : undefined,
    pausedSeconds: l.pausedSeconds ?? 0,
    state: l.state as LogState,
    formData: l.formData ?? null,
  }));

  // 7-day streak logs
  const rawWeekLogs = await TaskLog.find({
    companyId,
    date: { $in: weekDates },
  }).lean();

  const weekLogs = rawWeekLogs.map((l) => ({
    taskId: l.taskId.toString(),
    date: l.date,
    state: l.state as "done" | "missed" | "rest",
    actualMinutes: l.actualMinutes ?? null,
  }));

  // Today's standalone to-dos, plus any earlier undone ones carried forward as overdue
  const todayTodos = await Todo.find(todosForDateQuery(companyId, userId, today))
    .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
    .lean();
  const initialTodos = todayTodos.map(serializeTodo);

  return (
    <TasksView
      taskLists={taskListsWithTasks}
      initialLogs={initialLogs}
      initialTodos={initialTodos}
      weekLogs={weekLogs}
      weekDates={weekDates}
      today={today}
      userName={userName}
      userId={userId}
      userRole={role}
      skipAuth={skipAuth}
      autoStartNext={!!searchParams?.startNext}
      autoAddTask={!!searchParams?.addTask}
      autoResumeTimer={!!searchParams?.resumeTimer}
      autoOpenTaskId={searchParams?.openTaskId ?? null}
      autoOpenVerifiedNfcUid={searchParams?.verifiedNfcUid ?? null}
    />
  );
}
