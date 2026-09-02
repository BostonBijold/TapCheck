import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLE_RANK: Record<string, number> = { manager: 0, employee: 1 };

// GET /api/team — the read-only roster, open to any signed-in company
// member (not manager-gated). Managers first, then alphabetical by name.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  // Unlike every other model's companyId (plain String — see CLAUDE.md's
  // Multi-Tenancy section), User.companyId is Mongoose-typed as ObjectId.
  // SKIP_AUTH's dev sentinel company id isn't a valid ObjectId and would
  // otherwise make this query throw a cast error — same defensive pattern
  // as lib/task-list-session-actions.ts's getOpenSessionLocks(). No real
  // company ever has that id, so there's nothing to find either way.
  const users = mongoose.isValidObjectId(companyId)
    ? await User.find({ companyId }, "name image role createdAt companyJoinedAt").lean()
    : [];
  users.sort((a, b) => (ROLE_RANK[a.role] ?? 1) - (ROLE_RANK[b.role] ?? 1) || (a.name ?? "").localeCompare(b.name ?? ""));

  return NextResponse.json(
    users.map((u) => ({
      _id: u._id.toString(),
      name: u.name ?? "Unnamed",
      image: u.image ?? null,
      role: u.role,
      // Pre-existing users attached to a company by hand (before this
      // feature existed) have no companyJoinedAt — fall back to account
      // creation as the closest available signal.
      joinedAt: u.companyJoinedAt ?? u.createdAt ?? null,
    }))
  );
}
