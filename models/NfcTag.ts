import mongoose, { Schema, Document, model, models } from "mongoose";

// Maps a physical NFC tag's arbitrary UID (chosen when writing the tag
// externally via a tool like NFC Tools) to a RoutineItem, so a resolve page
// (app/(app)/nfc/t/[tagUID]/page.tsx) can look up which habit a tap is for.
// The tag itself only ever encodes a stable URL containing tagUID — never a
// routineItemId directly — so reassigning a tag to a different habit later
// is a database update here, not a re-tap-to-write.
export interface INfcTag extends Document {
  userId: string;
  tagUID: string;
  routineItemId: mongoose.Types.ObjectId | null;
  groupId: mongoose.Types.ObjectId | null;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const NfcTagSchema = new Schema<INfcTag>(
  {
    userId: { type: String, required: true, index: true },
    tagUID: { type: String, required: true },
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", default: null },
    groupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", default: null },
    label: { type: String, default: null },
  },
  { timestamps: true }
);

NfcTagSchema.index({ userId: 1, tagUID: 1 }, { unique: true });

export default models.NfcTag || model<INfcTag>("NfcTag", NfcTagSchema);
