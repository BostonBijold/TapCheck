import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import type { TaskType } from "@/models/Task";
import AppIntentLink from "@/models/AppIntentLink";
import TaskListEditView from "@/components/TaskListEditView";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EditTaskListPage({
  params,
}: {
  params: { taskListId: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId, userId } = sessionUser;
  if (!companyId) redirect("/tasks");

  await connectDB();

  const taskList = await TaskList.findOne({ _id: params.taskListId, companyId }).lean();
  if (!taskList) redirect("/tasks");

  const tasks = await Task.find({
    taskListId: params.taskListId,
    companyId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  // AppIntentLink stays scoped to the specific signed-in person — it
  // records whose Shortcut is connected to a task, not company config.
  const appIntentLinks = await AppIntentLink.find({
    userId,
    taskId: { $in: tasks.map((t) => t._id) },
  }).lean();
  const appIntentByTaskId = new Map(
    appIntentLinks.map((l) => [l.taskId.toString(), l.lastTriggeredAt.toISOString()])
  );

  return (
    <TaskListEditView
      taskList={{
        _id: taskList._id.toString(),
        name: taskList.name,
        startTime: taskList.startTime ?? null,
        scheduledDays: taskList.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
      }}
      tasks={tasks.map((t) => ({
        _id: t._id.toString(),
        name: t.name,
        icon: t.icon,
        projectedMinutes: t.projectedMinutes,
        order: t.order,
        taskType: (t.taskType ?? "form") as TaskType,
        formFields: t.formFields ?? [],
        // Existing documents predate these fields — Mongoose defaults only
        // apply on create, so a .lean() read can come back undefined.
        scheduledDays: t.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
        successThreshold: t.successThreshold ?? (t.scheduledDays?.length ?? 7),
        appIntentLastTriggeredAt: appIntentByTaskId.get(t._id.toString()) ?? null,
      }))}
    />
  );
}
