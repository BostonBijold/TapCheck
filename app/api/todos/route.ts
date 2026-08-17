import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Todo, { serializeTodo, todosForDateQuery } from "@/models/Todo";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string): string | null {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  const after = req.nextUrl.searchParams.get("after");

  await connectDB();

  // Future to-dos (scheduledDate strictly after `after`) — the Goals-page backlog.
  // Everything due today-or-earlier lives on the Routines page instead (see `date` below).
  if (after) {
    const todos = await Todo.find({ userId, scheduledDate: { $gt: after } })
      .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
      .lean();
    return NextResponse.json(todos.map(serializeTodo));
  }

  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const todos = await Todo.find(todosForDateQuery(userId, date))
    .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
    .lean();
  return NextResponse.json(todos.map(serializeTodo));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, scheduledDate, estimatedMinutes } = (await req.json()) as {
    name: string;
    scheduledDate: string;
    estimatedMinutes?: number;
  };

  if (!name?.trim() || !scheduledDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await connectDB();
  const order = await Todo.countDocuments({ userId, scheduledDate });
  const todo = await Todo.create({
    userId,
    name: name.trim(),
    scheduledDate,
    estimatedMinutes: estimatedMinutes ?? null,
    order,
  });

  return NextResponse.json(serializeTodo(todo), { status: 201 });
}
