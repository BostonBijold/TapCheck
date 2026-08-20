import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import VirtueModel from "@/models/Virtue";

export const dynamic = "force-dynamic";

// PATCH /api/virtues/reorder — admin-only. Same bulk-update shape as
// PATCH /api/routine-items/reorder. philosophyId scopes the update so a
// malformed/malicious id list can't touch virtues in a different philosophy.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { philosophyId, items } = await req.json() as {
    philosophyId?: string;
    items?: Array<{ _id: string; order: number }>;
  };

  if (!philosophyId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "philosophyId and items required" }, { status: 400 });
  }

  await connectDB();

  await Promise.all(
    items.map(({ _id, order }) =>
      VirtueModel.updateOne({ _id, philosophyId }, { $set: { order } })
    )
  );

  return NextResponse.json({ ok: true });
}
