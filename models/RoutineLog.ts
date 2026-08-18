import mongoose, { Schema, Document, model, models } from "mongoose";

export type LogState = "in_progress" | "done" | "missed" | "rest";

export interface IRoutineLog extends Document {
  userId: string;
  routineItemId: mongoose.Types.ObjectId;
  date: string;              // YYYY-MM-DD
  actualMinutes?: number;    // null if missed/rest; derived from timestamps on timer completions
  startedAt?: Date;          // set when state → in_progress
  completedAt?: Date;        // set when state → done via timer
  state: LogState;
  note?: string;
  isBackEntry: boolean;
  // Set only while state === "in_progress" and this timer was started with a
  // routineGroupId (currently only possible via the external API — see
  // app/api/external/start-timer). Tells the client to reopen this item inside
  // a RoutineSession for that group on resume, instead of the standalone
  // timer. Cleared whenever the log leaves in_progress.
  sessionGroupId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const RoutineLogSchema = new Schema<IRoutineLog>(
  {
    userId: { type: String, required: true, index: true },
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
    date: { type: String, required: true },
    actualMinutes: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    state: { type: String, enum: ["in_progress", "done", "missed", "rest"], required: true },
    note: { type: String, default: null },
    isBackEntry: { type: Boolean, default: false },
    sessionGroupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", default: null },
  },
  { timestamps: true }
);

RoutineLogSchema.index({ userId: 1, date: 1 });
RoutineLogSchema.index({ userId: 1, routineItemId: 1, date: 1 }, { unique: true });

export default models.RoutineLog || model<IRoutineLog>("RoutineLog", RoutineLogSchema);
