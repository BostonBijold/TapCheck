import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import { sanitizeFormFields } from "@/lib/form-fields";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/tasks — add a task to a task list
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { taskListId, templateId, name, icon, projectedMinutes, taskType, scheduledDays, successThreshold, formFields } = await req.json();

  if (!taskListId || !name?.trim() || !icon) {
    return NextResponse.json({ error: "taskListId, name, and icon required" }, { status: 400 });
  }

  await connectDB();

  // Place at end of current list
  const maxOrder = await Task.findOne({ taskListId, companyId, isActive: true })
    .sort({ order: -1 })
    .lean();
  const nextOrder = maxOrder ? maxOrder.order + 1 : 0;

  // Default: every day, full threshold — existing (pre-schedule) behavior.
  const days: number[] = Array.isArray(scheduledDays) && scheduledDays.length > 0 ? scheduledDays : [0, 1, 2, 3, 4, 5, 6];
  // Clamp rather than reject — a threshold that can't mathematically be hit
  // is silently capped at the number of scheduled days instead.
  const threshold = Math.max(1, Math.min(typeof successThreshold === "number" ? successThreshold : days.length, days.length));

  const task = await Task.create({
    companyId,
    taskListId,
    templateId: templateId ?? null,
    name: name.trim(),
    icon,
    projectedMinutes: taskType === "checkbox" ? 0 : (projectedMinutes ?? 15),
    taskType: taskType ?? "form",
    order: nextOrder,
    isActive: true,
    scheduledDays: days,
    successThreshold: threshold,
    formFields: sanitizeFormFields(formFields),
  });

  return NextResponse.json({
    _id: task._id.toString(),
    name: task.name,
    icon: task.icon,
    projectedMinutes: task.projectedMinutes,
    order: task.order,
    taskType: task.taskType,
    scheduledDays: task.scheduledDays,
    successThreshold: task.successThreshold,
    formFields: task.formFields,
  });
}
