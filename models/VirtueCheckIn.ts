import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IVirtueAnswer {
  virtueId: mongoose.Types.ObjectId;
  virtueName: string;
  answer: "yes" | "no";
}

export interface IVirtueCheckIn extends Document {
  userId: string;
  philosophyId: mongoose.Types.ObjectId; // the user's selected philosophy at write
                                          // time — stamped server-side, never
                                          // retroactively changed if they later switch
  date: string;           // YYYY-MM-DD
  weekStartDate: string;  // YYYY-MM-DD (Monday of that week)
  answers: IVirtueAnswer[];
  createdAt: Date;
}

const VirtueCheckInSchema = new Schema<IVirtueCheckIn>(
  {
    userId: { type: String, required: true, index: true },
    philosophyId: { type: Schema.Types.ObjectId, ref: "Philosophy", required: true },
    date: { type: String, required: true },
    weekStartDate: { type: String, required: true, index: true },
    answers: [
      {
        virtueId: { type: Schema.Types.ObjectId, ref: "Virtue", required: true },
        virtueName: { type: String, required: true },
        answer: { type: String, enum: ["yes", "no"], required: true },
      },
    ],
  },
  { timestamps: true }
);

VirtueCheckInSchema.index({ userId: 1, date: 1 }, { unique: true });

export default models.VirtueCheckIn ||
  model<IVirtueCheckIn>("VirtueCheckIn", VirtueCheckInSchema);
