import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const groups = await RoutineGroup.find({ companyId }).sort({ order: 1 }).lean();

  const groupsWithItems = await Promise.all(
    groups.map(async (group) => {
      const items = await RoutineItem.find({
        groupId: group._id,
        companyId,
        isActive: true,
      })
        .sort({ order: 1 })
        .lean();

      return {
        _id: group._id.toString(),
        name: group.name,
        timeOfDay: group.timeOfDay,
        order: group.order,
        items: items.map((item) => ({
          _id: item._id.toString(),
          name: item.name,
          icon: item.icon,
          projectedMinutes: item.projectedMinutes,
          order: item.order,
        })),
      };
    })
  );

  return NextResponse.json(groupsWithItems);
}
