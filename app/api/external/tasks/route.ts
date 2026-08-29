import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import { resolveTasks } from "@/lib/task-definitions";

export const dynamic = "force-dynamic";

// GET-based, read-only sibling to trigger-task — lists a company's active
// tasks so a caller can pick one before triggering it. Built for the native
// App Intents HabitEntityQuery (ios/App/App/AppIntents), which needs a live
// list to back a Shortcuts/Siri picker. See docs/features/app-intents.md.
//
// Flat, denormalized shape (task-list context inlined per task) rather than
// GET /api/task-lists's nested-list array — a picker entry needs "Opening
// Shift: Walk-in Fridge Temp" in one row, not a tree to flatten client-side.
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const apiSession = await findSessionByApiKey(apiKey);
  if (!apiSession) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  const { companyId } = apiSession;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const taskLists = await TaskList.find({ companyId }).sort({ order: 1 }).lean();
  const taskListOrder = new Map(taskLists.map((tl, i) => [tl._id.toString(), i]));
  const taskListName = new Map(taskLists.map((tl) => [tl._id.toString(), tl.name]));

  const rawTasks = await Task.find({ companyId, isActive: true }).sort({ order: 1 }).lean();
  const tasks = await resolveTasks(rawTasks);

  // Stable sort by list order — tasks within a list keep the task-order sort
  // the query above already applied.
  const sortedTasks = [...tasks].sort(
    (a, b) => (taskListOrder.get(a.taskListId.toString()) ?? 0) - (taskListOrder.get(b.taskListId.toString()) ?? 0)
  );

  const habits = sortedTasks.map((task) => {
    const taskListId = task.taskListId.toString();
    return {
      id: task._id.toString(),
      name: task.name,
      icon: task.icon,
      itemType: task.taskType,
      groupId: taskListId,
      groupName: taskListName.get(taskListId) ?? "",
    };
  });

  return NextResponse.json({ ok: true, habits });
}
