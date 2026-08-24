import mongoose, { Schema, Document, model, models } from "mongoose";

export type LogState = "in_progress" | "paused" | "done" | "missed" | "rest";

// Where a routine_review session was triggered from — see docs/features/routine-review.md.
// "notification" isn't wired up to anything yet (a future "it's been a month" nudge),
// but the value exists now so that work doesn't need another schema change.
export type ReviewEntryPoint = "sunday_prompt" | "analytics_button" | "notification";

export interface IReviewMetadata {
  entryPoint: ReviewEntryPoint;
  groupId: mongoose.Types.ObjectId; // which routine group this session reviewed
  changesMade: boolean;
  itemGoalChanges?: Array<{ routineItemId: mongoose.Types.ObjectId; oldMinutes: number; newMinutes: number }>;
  startTimeChange?: { old: string | null; new: string | null };
  reorder?: { old: mongoose.Types.ObjectId[]; new: mongoose.Types.ObjectId[] };
}

export interface IRoutineLog extends Document {
  userId: string;
  routineItemId: mongoose.Types.ObjectId;
  date: string;              // YYYY-MM-DD
  actualMinutes?: number;    // null if missed/rest; derived from timestamps on timer completions
  startedAt?: Date;          // set when state → in_progress; null while paused
  completedAt?: Date;        // set when state → done via timer
  // Elapsed seconds banked from prior running segments of this same log —
  // e.g. jumping away from an item inside a Routine Session pauses it and
  // banks whatever it had accumulated so far, rather than completing it.
  // Total elapsed while running = pausedSeconds + (now - startedAt).
  pausedSeconds: number;
  state: LogState;
  note?: string;
  isBackEntry: boolean;
  // Set only while state === "in_progress" and this timer was started with a
  // routineGroupId (currently only possible via the external API — see
  // app/api/external/start-timer). Tells the client to reopen this item inside
  // a RoutineSession for that group on resume, instead of the standalone
  // timer. Cleared whenever the log leaves in_progress.
  sessionGroupId?: mongoose.Types.ObjectId | null;
  // Only set on the terminal log for a routine_review item (see
  // components/RoutineReviewFlow.tsx) — every other log leaves this undefined.
  reviewMetadata?: IReviewMetadata | null;
  createdAt: Date;
}

const ReviewMetadataSchema = new Schema<IReviewMetadata>(
  {
    entryPoint: { type: String, enum: ["sunday_prompt", "analytics_button", "notification"], required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", required: true },
    changesMade: { type: Boolean, required: true },
    itemGoalChanges: {
      type: [
        {
          routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
          oldMinutes: { type: Number, required: true },
          newMinutes: { type: Number, required: true },
        },
      ],
      default: undefined,
    },
    startTimeChange: {
      type: new Schema({ old: { type: String, default: null }, new: { type: String, default: null } }, { _id: false }),
      default: undefined,
    },
    reorder: {
      type: new Schema(
        {
          old: { type: [Schema.Types.ObjectId], default: undefined },
          new: { type: [Schema.Types.ObjectId], default: undefined },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { _id: false }
);

const RoutineLogSchema = new Schema<IRoutineLog>(
  {
    userId: { type: String, required: true, index: true },
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
    date: { type: String, required: true },
    actualMinutes: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    pausedSeconds: { type: Number, default: 0 },
    state: { type: String, enum: ["in_progress", "paused", "done", "missed", "rest"], required: true },
    note: { type: String, default: null },
    isBackEntry: { type: Boolean, default: false },
    sessionGroupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", default: null },
    reviewMetadata: { type: ReviewMetadataSchema, default: null },
  },
  { timestamps: true }
);

RoutineLogSchema.index({ userId: 1, date: 1 });
RoutineLogSchema.index({ userId: 1, routineItemId: 1, date: 1 }, { unique: true });

export default models.RoutineLog || model<IRoutineLog>("RoutineLog", RoutineLogSchema);
