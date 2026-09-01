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
  const company = await Company.findById(companyId, "notificationSound").lean<{ notificationSound?: string }>();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ notificationSound: company.notificationSound ?? "standard" });
}

export async function PATCH(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = (await req.json()) as { notificationSound?: string };
  if (body.notificationSound !== "standard" && body.notificationSound !== "male") {
    return NextResponse.json({ error: "notificationSound must be 'standard' or 'male'" }, { status: 400 });
  }

  await connectDB();
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: { notificationSound: body.notificationSound } },
    { returnDocument: "after" }
  ).lean<{ notificationSound?: string }>();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ notificationSound: company.notificationSound ?? "standard" });
}
