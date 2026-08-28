import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Session-authenticated (not the API key) — this comes from the app's own
// logged-in JS, immediately after the native side receives a Live Activity
// push token. See docs/features/live-activity.md's "Push-driven updates"
// section and ios/App/App/LiveActivityPlugin.swift's pushTokenReceived
// event, relayed from lib/native/routine-activity.ts.
//
// Always overwrites rather than versioning — only the latest token is ever
// usable, and there's at most one relevant Live Activity per user at a time
// (the single-active-timer invariant).
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId } = sessionUser;

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  const environment = body.environment === "production" ? "production" : "sandbox";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // SKIP_AUTH's dev user isn't a real Mongo User document (see
  // lib/api-key.ts's getOrCreateApiKey for the same guard) — nothing to
  // persist to, so just no-op rather than throw a CastError.
  if (!mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ ok: true });
  }

  await connectDB();
  await User.updateOne(
    { _id: userId },
    { liveActivityPushToken: token, liveActivityPushEnvironment: environment }
  );

  return NextResponse.json({ ok: true });
}
