import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import { resolveTasks } from "@/lib/task-definitions";
import { resolveSessionUser } from "@/lib/session";
import ManageTasksView from "@/components/ManageTasksView";

export const dynamic = "force-dynamic";

// Manager-only "Manage Tasks" screen — task lists (tap to rename/schedule/
// delete), the standalone (anytime-list) tasks, and the company's full
// saved-task catalog (see docs/features/task-lists.md's "Company Task
// Catalog" section) where NFC tags get tied to a task, regardless of which
// list(s) use it. Not part of the bottom nav (Tasks/Analytics + FAB is the
// fixed shape — see CLAUDE.md) — reached from a manager-only icon in the
// Tasks page header and from the Profile page.
export default async function ManageTasksPage() {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId } = sessionUser;
  if (!companyId) redirect("/tasks");
  if (sessionUser.role !== "manager") redirect("/tasks");

  await connectDB();

  const taskLists = await TaskList.find({ companyId, isActive: true }).sort({ order: 1 }).lean();
  const scheduledTaskLists = taskLists.filter((tl) => tl.timeOfDay !== "anytime");
  const anytimeTaskListIds = taskLists.filter((tl) => tl.timeOfDay === "anytime").map((tl) => tl._id);

  const rawStandaloneTasks = await Task.find({
    taskListId: { $in: anytimeTaskListIds },
    companyId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();
  const standaloneTasks = await resolveTasks(rawStandaloneTasks);

  const today = new Date().toISOString().split("T")[0];
  const userName = session?.user?.name ?? "Developer";

  return (
    <ManageTasksView
      userName={userName}
      today={today}
      skipAuth={skipAuth}
      taskLists={scheduledTaskLists.map((tl) => ({
        _id: tl._id.toString(),
        name: tl.name,
        startTime: tl.startTime ?? null,
      }))}
      standaloneTasks={standaloneTasks.map((t) => ({
        _id: t._id.toString(),
        name: t.name,
        icon: t.icon,
        projectedMinutes: t.projectedMinutes,
      }))}
    />
  );
}
