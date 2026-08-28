import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineItem from "@/models/RoutineItem";
import { sanitizeFormFields } from "@/lib/form-fields";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/routine-items — add a habit to a routine group
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { groupId, templateId, name, icon, projectedMinutes, itemType, scheduledDays, successThreshold, formFields } = await req.json();

  if (!groupId || !name?.trim() || !icon) {
    return NextResponse.json({ error: "groupId, name, and icon required" }, { status: 400 });
  }

  await connectDB();

  // Place at end of current list
  const maxOrder = await RoutineItem.findOne({ groupId, companyId, isActive: true })
    .sort({ order: -1 })
    .lean();
  const nextOrder = maxOrder ? maxOrder.order + 1 : 0;

  // Default: every day, full threshold — existing (pre-schedule) behavior.
  const days: number[] = Array.isArray(scheduledDays) && scheduledDays.length > 0 ? scheduledDays : [0, 1, 2, 3, 4, 5, 6];
  // Clamp rather than reject — a threshold that can't mathematically be hit
  // is silently capped at the number of scheduled days instead.
  const threshold = Math.max(1, Math.min(typeof successThreshold === "number" ? successThreshold : days.length, days.length));

  const item = await RoutineItem.create({
    companyId,
    groupId,
    templateId: templateId ?? null,
    name: name.trim(),
    icon,
    projectedMinutes: itemType === "checkbox" ? 0 : (projectedMinutes ?? 15),
    itemType: itemType ?? "form_check",
    order: nextOrder,
    isActive: true,
    scheduledDays: days,
    successThreshold: threshold,
    formFields: sanitizeFormFields(formFields),
  });

  return NextResponse.json({
    _id: item._id.toString(),
    name: item.name,
    icon: item.icon,
    projectedMinutes: item.projectedMinutes,
    order: item.order,
    itemType: item.itemType,
    scheduledDays: item.scheduledDays,
    successThreshold: item.successThreshold,
    formFields: item.formFields,
  });
}
