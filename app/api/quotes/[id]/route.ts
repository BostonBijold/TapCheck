import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import Quote from "@/models/Quote";
import { computeLengthTier } from "@/lib/quote-selection";

export const dynamic = "force-dynamic";

// PATCH /api/quotes/[id] — admin-only. Any subset of
// { text, author, genre, virtue, virtueDayIndex, source, isActive }.
// Pass virtueDayIndex: null to clear a pin.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    text?: string; author?: string; genre?: string; virtue?: string | null;
    virtueDayIndex?: number | null; source?: string | null; isActive?: boolean;
  };

  await connectDB();

  const update: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};

  if (body.text !== undefined) update.text = body.text.trim();
  if (body.author !== undefined) update.author = body.author.trim();
  if (body.genre !== undefined) update.genre = body.genre.trim();
  if (body.isActive !== undefined) update.isActive = body.isActive;

  if (body.virtue === null || body.virtue === "") unset.virtue = "";
  else if (body.virtue !== undefined) update.virtue = body.virtue.trim();

  if (body.virtueDayIndex === null) unset.virtueDayIndex = "";
  else if (body.virtueDayIndex !== undefined) update.virtueDayIndex = body.virtueDayIndex;

  if (body.source === null || body.source === "") unset.source = "";
  else if (body.source !== undefined) update.source = body.source.trim();

  const targetVirtue = (update.virtue as string | undefined);
  const targetDayIndex = (update.virtueDayIndex as number | undefined);
  if (targetVirtue && targetDayIndex) {
    const clash = await Quote.findOne({
      _id: { $ne: params.id },
      virtue: targetVirtue,
      virtueDayIndex: targetDayIndex,
      isActive: true,
    }).lean();
    if (clash) {
      return NextResponse.json(
        { error: `That day slot is already pinned for "${targetVirtue}"` },
        { status: 400 }
      );
    }
  }

  const ops: Record<string, unknown> = {};
  if (Object.keys(update).length) ops.$set = update;
  if (Object.keys(unset).length) ops.$unset = unset;

  const quote = await Quote.findByIdAndUpdate(params.id, ops, { returnDocument: "after" }).lean();
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: String(quote._id),
    text: quote.text,
    author: quote.author,
    genre: quote.genre,
    virtue: quote.virtue ?? null,
    virtueDayIndex: quote.virtueDayIndex ?? null,
    source: quote.source ?? null,
    lengthTier: quote.lengthTier ?? computeLengthTier(quote.text),
    isActive: quote.isActive,
    createdAt: quote.createdAt,
  });
}
