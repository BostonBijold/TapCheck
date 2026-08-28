import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import { sanitizeFormFields } from "@/lib/form-fields";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// DELETE /api/tasks/[id] — remove from the company's task list (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const task = await Task.findOne({ _id: params.id, companyId });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft delete — keeps log history intact
  task.isActive = false;
  await task.save();

  return NextResponse.json({ ok: true });
}

// PATCH /api/tasks/[id] — update name/icon/projectedMinutes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const updates = await req.json();
  const allowed = ["name", "icon", "projectedMinutes", "taskType", "scheduledDays", "successThreshold", "formFields"] as const;
  const sanitized: Partial<Record<(typeof allowed)[number], unknown>> = {};
  for (const key of allowed) {
    if (key in updates) sanitized[key] = updates[key];
  }
  if ("formFields" in sanitized) sanitized.formFields = sanitizeFormFields(sanitized.formFields);

  await connectDB();

  // Clamp threshold against whichever scheduledDays is now in effect —
  // the one just sent, or the task's existing one if only the threshold
  // changed — rather than rejecting a mathematically impossible value.
  // If neither is actually changing the threshold, preserve whatever it
  // already was (only clamping it down, never bumping it up to days.length
  // just because scheduledDays changed for an unrelated reason).
  if ("scheduledDays" in sanitized || "successThreshold" in sanitized) {
    const existing = await Task.findOne({ _id: params.id, companyId }).lean();
    const days = Array.isArray(sanitized.scheduledDays)
      ? (sanitized.scheduledDays as number[])
      : existing?.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
    const requestedThreshold = "successThreshold" in sanitized
      ? Number(sanitized.successThreshold)
      : existing?.successThreshold ?? days.length;
    sanitized.successThreshold = Math.max(1, Math.min(requestedThreshold, days.length));
  }

  const task = await Task.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: sanitized },
    { returnDocument: "after" }
  );
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: task._id.toString(),
    name: task.name,
    icon: task.icon,
    projectedMinutes: task.projectedMinutes,
    taskType: task.taskType,
    scheduledDays: task.scheduledDays,
    successThreshold: task.successThreshold,
    formFields: task.formFields,
  });
}
