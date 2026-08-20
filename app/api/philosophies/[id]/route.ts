import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import Philosophy from "@/models/Philosophy";

export const dynamic = "force-dynamic";

// PATCH /api/philosophies/[id] — admin-only. Any subset of
// { name, description, order, isActive } — toggling active/inactive is just
// an isActive PATCH through here, no separate endpoint.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string; description?: string; order?: number; isActive?: boolean;
  };

  await connectDB();

  const allowed = ["name", "description", "order", "isActive"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const philosophy = await Philosophy.findByIdAndUpdate(
    params.id,
    { $set: update },
    { returnDocument: "after" }
  ).lean();

  if (!philosophy) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: philosophy._id.toString(),
    name: philosophy.name,
    slug: philosophy.slug,
    description: philosophy.description,
    isSystem: philosophy.isSystem,
    isActive: philosophy.isActive,
    order: philosophy.order,
  });
}
