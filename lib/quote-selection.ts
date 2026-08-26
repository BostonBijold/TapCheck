// Quote selection for the loading screen (virtue-filtered, date-pinned) and
// the nav-button tap (fully random). Callers must have already called
// connectDB() — same convention as lib/philosophy.ts.

import Quote, { IQuote, QuoteLengthTier } from "@/models/Quote";
import Virtue from "@/models/Virtue";
import { resolveSelectedPhilosophyId } from "@/lib/philosophy";
import { currentVirtueOrder, isoWeekNumber, weekStartDate } from "@/lib/virtue-dates";

export interface QuoteDTO {
  _id: string;
  text: string;
  author: string;
  genre: string;
  virtue: string | null;
  virtueDayIndex: number | null;
  source: string | null;
  lengthTier: QuoteLengthTier;
}

const SHORT_MAX = 90;
const MEDIUM_MAX = 200;

export function computeLengthTier(text: string): QuoteLengthTier {
  if (text.length <= SHORT_MAX) return "short";
  if (text.length <= MEDIUM_MAX) return "medium";
  return "long";
}

function toDTO(doc: Pick<IQuote, "text" | "author" | "genre" | "virtue" | "virtueDayIndex" | "source" | "lengthTier"> & { _id: unknown }): QuoteDTO {
  return {
    _id: String(doc._id),
    text: doc.text,
    author: doc.author,
    genre: doc.genre,
    virtue: doc.virtue ?? null,
    virtueDayIndex: doc.virtueDayIndex ?? null,
    source: doc.source ?? null,
    lengthTier: doc.lengthTier ?? computeLengthTier(doc.text),
  };
}

// Deterministic string hash (FNV-1a-ish) — same input always yields the same
// non-negative seed, used to pick a "quote of the day" without needing every
// virtueDayIndex slot manually filled in.
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function fullyRandomQuote(): Promise<QuoteDTO | null> {
  const count = await Quote.countDocuments({ isActive: true });
  if (count === 0) return null;
  const skip = Math.floor(Math.random() * count);
  const doc = await Quote.findOne({ isActive: true }).skip(skip).lean();
  return doc ? toDTO(doc) : null;
}

// Which day (1-based, within the virtue's own 1..virtueCount weekly cycle)
// and which occurrence of that cycle this is within the calendar year,
// combined into a single 1-28 index (for a 13-virtue/52-week cycle: 4
// occurrences x 7 days). Callers pass the noon-anchored date they resolved
// "today" from, matching the anchoring convention in lib/virtue-dates.ts.
function computeVirtueDayIndex(date: Date, virtueCount: number): number {
  const week = isoWeekNumber(date);
  const occurrence = Math.floor((week - 1) / virtueCount) + 1;

  const monday = new Date(weekStartDate(date) + "T12:00:00");
  const dayPosition = Math.round((date.getTime() - monday.getTime()) / 86400000) + 1;
  const clampedDayPosition = Math.min(Math.max(dayPosition, 1), 7);

  return (occurrence - 1) * 7 + clampedDayPosition;
}

// Used only by the loading screen. Resolves the caller's current virtue,
// then: pinned override -> deterministic hash pick within that virtue's pool
// -> fully random active quote (never a blank screen).
export async function getQuoteForToday(userId: string, dateStr?: string): Promise<QuoteDTO | null> {
  const date = new Date((dateStr ?? new Date().toISOString().split("T")[0]) + "T12:00:00");

  const philosophyId = await resolveSelectedPhilosophyId(userId);
  if (!philosophyId) return fullyRandomQuote();

  const virtueCount = await Virtue.countDocuments({ philosophyId, isActive: true });
  if (virtueCount <= 0) return fullyRandomQuote();

  const order = currentVirtueOrder(date, virtueCount);
  const virtueDoc = await Virtue.findOne({ philosophyId, order, isActive: true }).lean();
  if (!virtueDoc) return fullyRandomQuote();

  const slug = virtueDoc.slug;
  const virtueDayIndex = computeVirtueDayIndex(date, virtueCount);

  const pinned = await Quote.findOne({ virtue: slug, virtueDayIndex, isActive: true }).lean();
  if (pinned) return toDTO(pinned);

  const pool = await Quote.find({ virtue: slug, isActive: true }).sort({ _id: 1 }).lean();
  if (pool.length === 0) return fullyRandomQuote();

  const seed = hashSeed(`${dateStr ?? date.toISOString().split("T")[0]}:${slug}`);
  const pick = pool[seed % pool.length];
  return toDTO(pick);
}

// Used by the nav-button tap. No virtue filter, no date logic — genuinely
// random on every call.
export async function getRandomQuote(): Promise<QuoteDTO | null> {
  return fullyRandomQuote();
}
