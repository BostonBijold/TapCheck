import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import PushToken from "@/models/PushToken";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Registers/refreshes this device's standing push-notification token — see
// docs/features/notifications.md's "Device registration". Open to any
// signed-in company user, manager or employee: the "missed list" alert is
// manager-only (lib/notifications.ts's sendMissedListAlert filters by
// role), but the "time to start" alert reaches everyone — this route
// doesn't know or care which alert types a given token will end up
// receiving, it just registers the device.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Hardcoded to "sandbox", NOT inferred from process.env.NODE_ENV — an
  // earlier version of this route tried the NODE_ENV approach (mirroring
  // LiveActivityPlugin.swift's own #if DEBUG tagging in spirit), but that
  // was backwards: server environment has nothing to do with which APNs
  // host a given device token is valid against, and it produced a 100%
  // failure rate in practice, not a rare edge case — every push attempt
  // got tagged "production" (Vercel prod always sets NODE_ENV=production)
  // while ios/App/App/App.entitlements hardcodes `aps-environment:
  // development` for EVERY build, Debug or Release, so every real device
  // token is only ever valid against APNs' sandbox host regardless of
  // which server answered the registration request. Revisit this the
  // moment that entitlement becomes genuinely build-configuration-
  // dependent (a real Release/Distribution/TestFlight/App-Store path) —
  // until then, "sandbox" is simply correct, not a compromise.
  const environment = "sandbox";

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

  console.log(`/api/push-tokens: registered token for userId ${userId}, companyId ${companyId}, environment ${environment}`);

  return NextResponse.json({ ok: true });
}
