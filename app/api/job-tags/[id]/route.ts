import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { renameJobTag, archiveJobTag } from "@/lib/job-tags";
import { resolveSessionUser, isManagerOrAbove } from "@/lib/session";

export const dynamic = "force-dynamic";

// PATCH /api/job-tags/[id] — rename. Manager-only. Cascades the new name
// onto every User.jobTags entry that held the old one (see lib/job-tags.ts).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isManagerOrAbove(role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  const tag = await renameJobTag(companyId, params.id, name);
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ _id: tag._id.toString(), name: tag.name });
}

// DELETE /api/job-tags/[id] — archive (soft delete). Manager-only. Strips
// the tag from every teammate who had it — see lib/job-tags.ts's
// archiveJobTag.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isManagerOrAbove(role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const result = await archiveJobTag(companyId, params.id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, unassignedCount: result.unassignedCount });
}
