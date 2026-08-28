import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Todo, { serializeTodo } from "@/models/Todo";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const body = (await req.json()) as {
    done?: boolean;
    name?: string;
    scheduledDate?: string;
    estimatedMinutes?: number | null;
  };

  await connectDB();
  const setData: Record<string, unknown> = {};
  if (body.done !== undefined) {
    setData.done = body.done;
    setData.completedAt = body.done ? new Date() : null;
  }
  if (body.name !== undefined) setData.name = body.name.trim();
  if (body.scheduledDate !== undefined) setData.scheduledDate = body.scheduledDate;
  if (body.estimatedMinutes !== undefined) setData.estimatedMinutes = body.estimatedMinutes;

  const todo = await Todo.findOneAndUpdate(
    { _id: params.id, companyId, userId },
    { $set: setData },
    { returnDocument: "after" }
  ).lean();

  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeTodo(todo));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();
  await Todo.deleteOne({ _id: params.id, companyId, userId });
  return NextResponse.json({ ok: true });
}
