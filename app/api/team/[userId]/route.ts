import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Unlike every other model's companyId (plain String — see CLAUDE.md's
// Multi-Tenancy section), User.companyId is Mongoose-typed as ObjectId, and
// params.userId feeds straight into a User _id lookup too. Neither
// SKIP_AUTH's dev sentinel ids (see lib/session.ts) nor a malformed userId
// param are valid ObjectIds, and would otherwise make every query below
// throw a cast error instead of just not matching — same defensive pattern
// as lib/task-list-session-actions.ts's getOpenSessionLocks(). No real
// document could ever match either id, so this is just an earlier, cleaner
// 404 than the cast error would have produced.
function isAddressable(companyId: string, userId: string) {
  return mongoose.isValidObjectId(companyId) && mongoose.isValidObjectId(userId);
}

// PATCH /api/team/[userId] — manager changes a teammate's role. Blocked if
// it would demote the company's last remaining manager — a company with
// zero managers is a lockout state nobody can recover from through the UI.
export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role: sessionRole } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (sessionRole !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { role } = (await req.json()) as { role?: string };
  if (role !== "employee" && role !== "manager") {
    return NextResponse.json({ error: "role must be 'employee' or 'manager'" }, { status: 400 });
  }

  if (!isAddressable(companyId, params.userId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();

  const target = await User.findOne({ _id: params.userId, companyId }, "role").lean<{ role?: string }>();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role === "employee" && target.role === "manager") {
    const managerCount = await User.countDocuments({ companyId, role: "manager" });
    if (managerCount <= 1) {
      return NextResponse.json({ error: "Can't demote the last manager" }, { status: 400 });
    }
  }

  await User.findOneAndUpdate({ _id: params.userId, companyId }, { $set: { role } });

  return NextResponse.json({ ok: true });
}

// DELETE /api/team/[userId] — manager removes a teammate from the company.
// A soft company-detach (companyId/role cleared back to the "not yet
// provisioned" state a brand-new sign-in sees), not an account deletion —
// their historical TaskLogs etc. stay scoped to the company they belonged
// to at the time. Same last-manager guard as PATCH above.
export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role: sessionRole } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (sessionRole !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  if (!isAddressable(companyId, params.userId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();

  const target = await User.findOne({ _id: params.userId, companyId }, "role").lean<{ role?: string }>();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "manager") {
    const managerCount = await User.countDocuments({ companyId, role: "manager" });
    if (managerCount <= 1) {
      return NextResponse.json({ error: "Can't remove the last manager" }, { status: 400 });
    }
  }

  await User.findOneAndUpdate(
    { _id: params.userId, companyId },
    { $set: { companyId: null, role: null, companyJoinedAt: null } }
  );

  return NextResponse.json({ ok: true });
}
