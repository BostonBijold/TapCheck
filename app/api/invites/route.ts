import crypto from "crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Invite from "@/models/Invite";
import User from "@/models/User";
import { resolveSessionUser, isManagerOrAbove, isOwner } from "@/lib/session";
import { validateLocationId } from "@/lib/locations";

export const dynamic = "force-dynamic";

const DEFAULT_MAX_USES = 1;
const DEFAULT_EXPIRES_IN_DAYS = 7;

// GET /api/invites — this company's non-revoked invites, newest first, for
// the Team tab's "Pending Invites" section. A revoked invite just
// disappears from this list entirely — no "revoked" state ever surfaced.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isManagerOrAbove(role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const invites = await Invite.find({ companyId, revokedAt: null }).sort({ createdAt: -1 }).lean();
  // createdByUserId isn't always a real User _id — SKIP_AUTH's dev sentinel
  // (see lib/session.ts's DEV_USER_ID) is a plain string, not a Mongo
  // ObjectId, and would otherwise make this $in query throw a cast error —
  // same defensive pattern as lib/task-list-session-actions.ts's
  // getOpenSessionLocks(). Falls through to the "Unknown" name below.
  const createdByIds = Array.from(new Set(invites.map((i) => i.createdByUserId))).filter((id) =>
    mongoose.isValidObjectId(id)
  );
  const creators = createdByIds.length > 0
    ? await User.find({ _id: { $in: createdByIds } }, "name").lean()
    : [];
  const nameById = new Map(creators.map((u) => [u._id.toString(), u.name as string]));

  return NextResponse.json(
    invites.map((i) => ({
      _id: i._id.toString(),
      role: i.role,
      maxUses: i.maxUses,
      useCount: i.useCount,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      createdByName: nameById.get(i.createdByUserId) ?? "Unknown",
    }))
  );
}

// POST /api/invites — manager generates a join link. companyId/role never
// come from the client beyond the *preset* role a redeemer will receive;
// which company the invite belongs to is always the manager's own session
// company. See docs/features/team-invites.md's "Redemption flow".
export async function POST(req: Request) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role: sessionRole, userId, locationId: sessionLocationId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isManagerOrAbove(sessionRole)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { role, maxUses, expiresInDays, locationId: requestedLocationId } = (await req.json()) as {
    role?: string;
    maxUses?: number;
    expiresInDays?: number;
    // Only meaningful for an owner (see below) — a location-bound manager
    // always gets their own locationId stamped instead, same as `role`
    // itself is preset by the inviter rather than picked by the redeemer.
    locationId?: string;
  };

  if (role !== "employee" && role !== "manager") {
    return NextResponse.json({ error: "role must be 'employee' or 'manager'" }, { status: 400 });
  }

  await connectDB();

  // An owner has no single "current" location the way a location-bound
  // manager does, so they must pick one explicitly — see
  // docs/features/locations.md's "Invite changes". A manager's own
  // locationId is stamped regardless of what (if anything) the client sent.
  const locationId = isOwner(sessionRole)
    ? await validateLocationId(companyId, requestedLocationId)
    : sessionLocationId;
  if (!locationId) {
    return NextResponse.json({ error: "A valid locationId is required" }, { status: 400 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (expiresInDays && expiresInDays > 0 ? expiresInDays : DEFAULT_EXPIRES_IN_DAYS));

  const invite = await Invite.create({
    companyId,
    token: crypto.randomBytes(24).toString("base64url"),
    role,
    locationId,
    createdByUserId: userId,
    expiresAt,
    maxUses: maxUses && maxUses > 0 ? maxUses : DEFAULT_MAX_USES,
  });

  const origin = new URL(req.url).origin;

  return NextResponse.json({
    _id: invite._id.toString(),
    token: invite.token,
    url: `${origin}/invite/${invite.token}`,
    role: invite.role,
    maxUses: invite.maxUses,
    expiresAt: invite.expiresAt,
  });
}
