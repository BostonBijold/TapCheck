import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskList from "@/models/TaskList";
import { seedDefaultTaskLists } from "@/lib/seed";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const existing = await TaskList.findOne({ companyId });
  if (existing) {
    return NextResponse.json({ message: "Already seeded" });
  }

  await seedDefaultTaskLists(companyId);
  return NextResponse.json({ ok: true });
}
