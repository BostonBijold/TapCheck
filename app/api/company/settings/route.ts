import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Company from "@/models/Company";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET is open to any signed-in company user (not just managers) — every
// device needs to read notificationSound to know which chirp to play on
// its own NFC-verified saves, not just the manager who set it.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();
  const company = await Company.findById(
    companyId,
    "notificationSound timezone notificationsEnabled"
  ).lean<{ notificationSound?: string; timezone?: string | null; notificationsEnabled?: boolean }>();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    notificationSound: company.notificationSound ?? "standard",
    timezone: company.timezone ?? null,
    notificationsEnabled: company.notificationsEnabled ?? true,
  });
}

export async function PATCH(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = (await req.json()) as {
    notificationSound?: string;
    timezone?: string;
    notificationsEnabled?: boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.notificationSound !== undefined) {
    if (body.notificationSound !== "standard" && body.notificationSound !== "male") {
      return NextResponse.json({ error: "notificationSound must be 'standard' or 'male'" }, { status: 400 });
    }
    update.notificationSound = body.notificationSound;
  }
  if (body.timezone !== undefined) {
    // Validated by trying to actually use it as an IANA zone name — the
    // cheapest correctness check available without a zone-name dependency.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
    } catch {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    update.timezone = body.timezone;
  }
  if (body.notificationsEnabled !== undefined) {
    update.notificationsEnabled = !!body.notificationsEnabled;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await connectDB();
  const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { returnDocument: "after" }).lean<{
    notificationSound?: string;
    timezone?: string | null;
    notificationsEnabled?: boolean;
  }>();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    notificationSound: company.notificationSound ?? "standard",
    timezone: company.timezone ?? null,
    notificationsEnabled: company.notificationsEnabled ?? true,
  });
}
