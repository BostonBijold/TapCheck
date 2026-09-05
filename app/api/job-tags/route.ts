import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import JobTag from "@/models/JobTag";
import { resolveSessionUser, isManagerOrAbove } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/job-tags — the company's active job-tag catalog. Open to any
// signed-in company user, same as /api/inventory-groups — a future
// mobile assignment UI would read this too, not just the console.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const tags = await JobTag.find({ companyId, isActive: true }).sort({ createdAt: 1 }).lean();

  return NextResponse.json(tags.map((t) => ({ _id: t._id.toString(), name: t.name })));
}

// POST /api/job-tags — create a tag. Manager-only, same gate as
// /api/inventory-groups.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isManagerOrAbove(role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  const existing = await JobTag.findOne({ companyId, name, isActive: true }).lean();
  if (existing) return NextResponse.json({ error: "That tag already exists" }, { status: 409 });

  const tag = await JobTag.create({ companyId, name, createdByUserId: userId });

  return NextResponse.json({ _id: tag._id.toString(), name: tag.name });
}
