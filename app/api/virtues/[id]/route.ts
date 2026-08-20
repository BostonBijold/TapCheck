import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import VirtueModel from "@/models/Virtue";

export const dynamic = "force-dynamic";

// PATCH /api/virtues/[id] — admin-only. Full edit surface for a virtue
// within its philosophy: essay/etymology (the original, still user-facing
// via VirtueDetailView/VirtueSheet), plus displayName/tagline/order/isActive
// for the Philosophy management sheet (create/edit/reorder/soft-delete).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    essay?: string;
    etymology?: string;
    displayName?: string;
    tagline?: string;
    order?: number;
    isActive?: boolean;
  };

  await connectDB();

  const allowed = ["essay", "etymology", "displayName", "tagline", "order", "isActive"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const virtue = await VirtueModel.findByIdAndUpdate(
    params.id,
    { $set: update },
    { returnDocument: "after" }
  ).lean();

  if (!virtue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: virtue._id.toString(),
    philosophyId: virtue.philosophyId.toString(),
    name: virtue.name,
    slug: virtue.slug,
    displayName: virtue.displayName,
    tagline: virtue.tagline,
    order: virtue.order,
    essay: virtue.essay,
    etymology: virtue.etymology,
    isActive: virtue.isActive,
  });
}
