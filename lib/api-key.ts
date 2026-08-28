import crypto from "crypto";
import mongoose from "mongoose";
import User from "@/models/User";
import { DEV_COMPANY_ID } from "@/lib/session";

export function generateApiKey(): string {
  return `boak_${crypto.randomBytes(24).toString("hex")}`;
}

// Lazily creates and persists an API key for the user the first time it's
// requested ("generated once" — the profile page just displays whatever
// this returns). Never rotates an existing key automatically.
//
// SKIP_AUTH's dev user isn't a real Mongo User document (no adapter-driven
// sign-in ever created one), so it can't hold a persisted key — fall back to
// a deterministic, unpersisted key so external-endpoint testing still works
// locally without touching the database.
export async function getOrCreateApiKey(userId: string): Promise<string> {
  if (!mongoose.isValidObjectId(userId)) {
    return `boak_dev_${userId}`;
  }

  const existing = await User.findById(userId).lean<{ apiKey?: string | null }>();
  if (existing?.apiKey) return existing.apiKey;

  const apiKey = generateApiKey();
  await User.findByIdAndUpdate(userId, { $set: { apiKey } });
  return apiKey;
}

// Resolves an external request's API key back to the userId + companyId it
// belongs to, or null if it doesn't match anyone.
export async function findSessionByApiKey(
  apiKey: string
): Promise<{ userId: string; companyId: string | null } | null> {
  if (apiKey.startsWith("boak_dev_")) {
    return { userId: apiKey.slice("boak_dev_".length), companyId: DEV_COMPANY_ID };
  }
  const user = await User.findOne({ apiKey }).lean<{
    _id: { toString(): string };
    companyId?: { toString(): string } | null;
  }>();
  if (!user) return null;
  return { userId: user._id.toString(), companyId: user.companyId ? user.companyId.toString() : null };
}
