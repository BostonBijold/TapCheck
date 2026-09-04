import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import PushToken from "@/models/PushToken";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Registers/refreshes this device's standing push-notification token — see
// docs/features/notifications.md's "Device registration". Manager-only in
// v1: employees don't receive missed-list alerts, so there's nothing to
// register a token for.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Inferred server-side, not trusted from the client — same "#if DEBUG"
  // spirit as LiveActivityPlugin.swift's own tagging, approximated here via
  // which Vercel environment served the request. Known imperfection: a
  // TestFlight (Distribution-signed, real APNs sandbox) build talking to
  // this same production deployment would still be tagged "production" —
  // acceptable for v1 per docs/features/notifications.md, revisit if it
  // causes real missed pushes.
  const environment = process.env.NODE_ENV === "production" ? "production" : "sandbox";

  // SKIP_AUTH's dev user isn't a real Mongo User document — nothing
  // meaningful to attribute a token to.
  if (!mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ ok: true });
  }

  await connectDB();
  // Upsert on the token itself (unique index) — a reinstalled app
  // re-registering the same physical device just refreshes this row rather
  // than creating a duplicate; a token that moved to a different user
  // (device passed to a new hire) is reassigned, not left stale.
  await PushToken.updateOne(
    { token },
    { $set: { userId, companyId, environment, platform: "ios", lastSeenAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
