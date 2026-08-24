import mongoose, { Schema, Document, model, models } from "mongoose";

// "Arm, then tap" NFC linking: tapping "Link NFC Tag" in Manage Habit
// upserts one of these for the user, then the user physically taps an
// unclaimed tag — the /nfc/[tagCode] page checks for a fresh row here to
// know which routine item a cold tap should claim the tag for. One per
// user (you're only ever holding one tag at a time). Treated as stale and
// ignored if armedAt is older than a few minutes at read time — see
// lib/nfc-actions.ts — no TTL index needed for correctness, just hygiene.
export interface IPendingNfcLink extends Document {
  userId: string;
  routineItemId: mongoose.Types.ObjectId;
  armedAt: Date;
}

const PendingNfcLinkSchema = new Schema<IPendingNfcLink>({
  userId: { type: String, required: true, unique: true, index: true },
  routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
  armedAt: { type: Date, required: true, default: () => new Date() },
});

export default models.PendingNfcLink || model<IPendingNfcLink>("PendingNfcLink", PendingNfcLinkSchema);
