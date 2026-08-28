import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Todo, { serializeTodo, todosForDateQuery } from "@/models/Todo";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date");
  const after = req.nextUrl.searchParams.get("after");

  await connectDB();

  // Future to-dos (scheduledDate strictly after `after`) — the Goals-page backlog.
  // Everything due today-or-earlier lives on the Tasks page instead (see `date` below).
  if (after) {
    const todos = await Todo.find({ companyId, userId, scheduledDate: { $gt: after } })
      .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
      .lean();
    return NextResponse.json(todos.map(serializeTodo));
  }

  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const todos = await Todo.find(todosForDateQuery(companyId, userId, date))
    .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
    .lean();
  return NextResponse.json(todos.map(serializeTodo));
}

export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { name, scheduledDate, estimatedMinutes } = (await req.json()) as {
    name: string;
    scheduledDate: string;
    estimatedMinutes?: number;
  };

  if (!name?.trim() || !scheduledDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await connectDB();
  const order = await Todo.countDocuments({ companyId, userId, scheduledDate });
  const todo = await Todo.create({
    companyId,
    userId,
    name: name.trim(),
    scheduledDate,
    estimatedMinutes: estimatedMinutes ?? null,
    order,
  });

  return NextResponse.json(serializeTodo(todo), { status: 201 });
}
