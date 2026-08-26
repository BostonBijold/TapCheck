import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import Quote from "@/models/Quote";
import { computeLengthTier } from "@/lib/quote-selection";

export const dynamic = "force-dynamic";

function serialize(q: { _id: unknown; text: string; author: string; genre: string; virtue?: string; virtueDayIndex?: number; source?: string; lengthTier?: string; isActive: boolean; createdAt: Date }) {
  return {
    _id: String(q._id),
    text: q.text,
    author: q.author,
    genre: q.genre,
    virtue: q.virtue ?? null,
    virtueDayIndex: q.virtueDayIndex ?? null,
    source: q.source ?? null,
    lengthTier: q.lengthTier ?? computeLengthTier(q.text),
    isActive: q.isActive,
    createdAt: q.createdAt,
  };
}

// GET /api/quotes — admin-only listing for the authoring tool.
// Optional filters: ?virtue=, ?genre=, ?pinned=true|false (virtueDayIndex set/unset).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const params = req.nextUrl.searchParams;
  const virtue = params.get("virtue");
  const genre = params.get("genre");
  const pinned = params.get("pinned");

  const query: Record<string, unknown> = {};
  if (virtue) query.virtue = virtue;
  if (genre) query.genre = genre;
  if (pinned === "true") query.virtueDayIndex = { $exists: true, $ne: null };
  if (pinned === "false") query.virtueDayIndex = { $in: [null, undefined] };

  const quotes = await Quote.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json(quotes.map(serialize));
}

// POST /api/quotes — admin-only create.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { text, author, genre, virtue, virtueDayIndex, source } = await req.json() as {
    text?: string; author?: string; genre?: string; virtue?: string;
    virtueDayIndex?: number; source?: string;
  };

  if (!text?.trim() || !author?.trim() || !genre?.trim()) {
    return NextResponse.json({ error: "text, author, and genre required" }, { status: 400 });
  }

  await connectDB();

  if (virtue && virtueDayIndex) {
    const clash = await Quote.findOne({ virtue, virtueDayIndex, isActive: true }).lean();
    if (clash) {
      return NextResponse.json(
        { error: `That day slot is already pinned for "${virtue}"` },
        { status: 400 }
      );
    }
  }

  const quote = await Quote.create({
    text: text.trim(),
    author: author.trim(),
    genre: genre.trim(),
    virtue: virtue?.trim() || undefined,
    virtueDayIndex: virtueDayIndex || undefined,
    source: source?.trim() || undefined,
    isActive: true,
  });

  return NextResponse.json(serialize(quote), { status: 201 });
}
