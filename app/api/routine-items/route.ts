import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// POST /api/routine-items — add a habit to a routine group
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId, templateId, name, icon, projectedMinutes, itemType, scheduledDays, successThreshold } = await req.json();

  if (!groupId || !name?.trim() || !icon) {
    return NextResponse.json({ error: "groupId, name, and icon required" }, { status: 400 });
  }

  await connectDB();

  // Place at end of current list
  const maxOrder = await RoutineItem.findOne({ groupId, userId, isActive: true })
    .sort({ order: -1 })
    .lean();
  const nextOrder = maxOrder ? maxOrder.order + 1 : 0;

  // Default: every day, full threshold — existing (pre-schedule) behavior.
  const days: number[] = Array.isArray(scheduledDays) && scheduledDays.length > 0 ? scheduledDays : [0, 1, 2, 3, 4, 5, 6];
  // Clamp rather than reject — a threshold that can't mathematically be hit
  // is silently capped at the number of scheduled days instead.
  const threshold = Math.max(1, Math.min(typeof successThreshold === "number" ? successThreshold : days.length, days.length));

  const item = await RoutineItem.create({
    userId,
    groupId,
    templateId: templateId ?? null,
    name: name.trim(),
    icon,
    projectedMinutes: itemType === "checkbox" ? 0 : (projectedMinutes ?? 15),
    itemType: itemType ?? "standard",
    order: nextOrder,
    isActive: true,
    linkedGoalId: null,
    scheduledDays: days,
    successThreshold: threshold,
  });

  return NextResponse.json({
    _id: item._id.toString(),
    name: item.name,
    icon: item.icon,
    projectedMinutes: item.projectedMinutes,
    order: item.order,
    scheduledDays: item.scheduledDays,
    successThreshold: item.successThreshold,
  });
}
