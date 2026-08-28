import mongoose, { Schema, Document, model, models } from "mongoose";

export type LogState = "in_progress" | "paused" | "done" | "missed" | "rest";

export interface IRoutineLog extends Document {
  companyId: string;
  // Which specific user actually did the check — an attribute, not part of
  // the uniqueness key: any employee on shift might complete a given check,
  // so the meaningful uniqueness is one log per item per day for the whole
  // company (see the index below), not per user.
  performedByUserId: string;
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
  // Set only on the terminal log for a form_check item (see
  // components/FormCheckScreen.tsx) — every other log leaves this null.
  formData?: Record<string, string | number | boolean> | null;
  // NFC/card identifier that triggered this log, if any — populated when a
  // log is started via a tag-triggered external path; null for an in-app
  // manual start. Field exists ahead of the NFC reader itself (separate
  // work) so this isn't a later migration.
  tagId?: string | null;
  createdAt: Date;
}

const RoutineLogSchema = new Schema<IRoutineLog>(
  {
    companyId: { type: String, required: true, index: true },
    performedByUserId: { type: String, required: true },
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
    formData: { type: Schema.Types.Mixed, default: null },
    tagId: { type: String, default: null },
  },
  { timestamps: true }
);

RoutineLogSchema.index({ companyId: 1, date: 1 });
// One log per item per day for the whole company — not per user, since any
// employee on shift might complete a given check (performedByUserId is
// stored as an attribute on that single log, not part of this key).
RoutineLogSchema.index({ companyId: 1, routineItemId: 1, date: 1 }, { unique: true });

export default models.RoutineLog || model<IRoutineLog>("RoutineLog", RoutineLogSchema);
