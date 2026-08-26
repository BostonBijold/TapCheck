import { Schema, Document, model, models } from "mongoose";

export type QuoteLengthTier = "short" | "medium" | "long";

export interface IQuote extends Document {
  text: string;               // the quote itself — renamed from source collection's "quote" field
  author: string;
  genre: string;               // where the quote came from (stoic, videogame, movie, etc.) — not a virtue
  virtue?: string;              // slug matching a Virtue.slug — used only by the loading-screen rotation
  virtueDayIndex?: number;      // 1-28, pins this quote to a specific day within virtue's yearly rotation
                                 // (unique within a given `virtue` only, not a shared global counter)
  source?: string;              // book/speech title, if ever added
  lengthTier?: QuoteLengthTier; // computed on the fly from text.length if unset — see lib/quote-selection.ts
  isActive: boolean;
  createdAt: Date;
}

const QuoteSchema = new Schema<IQuote>({
  text: { type: String, required: true },
  author: { type: String, required: true },
  genre: { type: String, required: true },
  virtue: { type: String, index: true },
  virtueDayIndex: { type: Number, min: 1, max: 28 },
  source: { type: String },
  lengthTier: { type: String, enum: ["short", "medium", "long"] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Supports the loading screen's pinned-quote lookup (virtue + virtueDayIndex),
// scoped to active quotes only.
QuoteSchema.index({ virtue: 1, virtueDayIndex: 1 });
QuoteSchema.index({ isActive: 1 });

export default models.Quote || model<IQuote>("Quote", QuoteSchema);
