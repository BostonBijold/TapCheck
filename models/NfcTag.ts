import mongoose, { Schema, Document, model, models } from "mongoose";

// A physical NFC tag, pre-manufactured with a URL of the form
// https://<domain>/nfc/<tagCode> written to it by an external NFC writer
// app — this app never writes tags itself. tagCode is generated ahead of
// time (see scripts/generate-nfc-tags.mjs) and exists as an unclaimed row
// before any user owns it. A separate collection (not a field on
// RoutineItem) so one habit can have multiple tags pointing at it — e.g. a
// tag by the shower and one by the gym bag, both starting the same routine.
export interface INfcTag extends Document {
  tagCode: string;
  userId: string | null;
  routineItemId: mongoose.Types.ObjectId | null;
  routineGroupId: mongoose.Types.ObjectId | null;
  claimedAt: Date | null;
}

const NfcTagSchema = new Schema<INfcTag>(
  {
    tagCode: { type: String, required: true, unique: true, index: true },
    userId: { type: String, default: null, index: true },
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", default: null },
    routineGroupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", default: null },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default models.NfcTag || model<INfcTag>("NfcTag", NfcTagSchema);
