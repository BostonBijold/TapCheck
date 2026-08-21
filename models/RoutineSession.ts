import mongoose, { Schema, Document, model, models } from "mongoose";

export type RoutineSessionStatus = "in_progress" | "completed";
export type CompletionState = "done" | "missed" | "rest";

export interface ICompletionEntry {
  routineItemId: mongoose.Types.ObjectId;
  completedAt: Date;
  state: CompletionState;
}

export interface IRoutineSession extends Document {
  // String, not ObjectId, matching every other model's userId (RoutineLog,
  // RoutineItem, RoutineGroup) — this is the id NextAuth puts on the
  // session, and SKIP_AUTH's local dev user ("dev-local-user") isn't a
  // valid ObjectId at all, so it must stay a plain string here too.
  userId: string;
  groupId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  startedAt: Date;
  completedAt: Date | null;
  status: RoutineSessionStatus;
  totalActualMinutes: number;
  completionSequence: ICompletionEntry[];
  pauseOrJumpCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CompletionEntrySchema = new Schema<ICompletionEntry>(
  {
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
    completedAt: { type: Date, required: true },
    state: { type: String, enum: ["done", "missed", "rest"], required: true },
  },
  { _id: false }
);

const RoutineSessionSchema = new Schema<IRoutineSession>(
  {
    userId: { type: String, required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", required: true },
    date: { type: String, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    totalActualMinutes: { type: Number, default: 0 },
    completionSequence: { type: [CompletionEntrySchema], default: [] },
    pauseOrJumpCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// No unique index — a group can legitimately be started, finished, and
// started again the same day (e.g. redoing a routine), and each run gets
// its own session record rather than colliding with the last one. This
// index just makes "find the open session for this user/group/date"
// (the lookup every write path below needs) cheap.
RoutineSessionSchema.index({ userId: 1, groupId: 1, date: 1, status: 1 });

export default models.RoutineSession || model<IRoutineSession>("RoutineSession", RoutineSessionSchema);
