import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Todo, { serializeTodo } from "@/models/Todo";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string): string | null {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    { _id: params.id, userId },
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
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  await Todo.deleteOne({ _id: params.id, userId });
  return NextResponse.json({ ok: true });
}
