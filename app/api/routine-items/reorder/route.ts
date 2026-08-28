import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import RoutineItem from "@/models/RoutineItem";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// PATCH /api/routine-items/reorder
// Body: { items: Array<{ _id: string; order: number }> }
export async function PATCH(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { items } = (await req.json()) as { items: Array<{ _id: string; order: number }> };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  await connectDB();

  await Promise.all(
    items.map(({ _id, order }) =>
      RoutineItem.updateOne({ _id, companyId }, { $set: { order } })
    )
  );

  return NextResponse.json({ ok: true });
}
