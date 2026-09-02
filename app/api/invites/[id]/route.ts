import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Invite from "@/models/Invite";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// DELETE /api/invites/[id] — manager revokes a pending invite. Soft-delete
// (revokedAt set, not removed) so a redemption already in flight against
// this token fails cleanly against the revoked state rather than a missing
// document — see docs/features/team-invites.md.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const invite = await Invite.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
