import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const body = await req.json() as {
    name?: string;
    startTime?: string | null;
  };

  await connectDB();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.startTime !== undefined) update.startTime = body.startTime || null;

  const group = await RoutineGroup.findOneAndUpdate(
    { _id: params.groupId, companyId },
    { $set: update },
    { returnDocument: "after" }
  ).lean();

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: group._id.toString(),
    name: group.name,
    startTime: group.startTime ?? null,
  });
}
