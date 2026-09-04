import mongoose, { Schema, Document, model, models } from "mongoose";

// Dedup guard for the "time to start" alert — a shift-window list that
// still has zero TaskLog rows against it NOT_STARTED_GRACE_MINUTES after
// its own startTime (see lib/task-list-window.ts and
// app/api/cron/check-missed-lists). Same purpose and write-then-send
// convention as models/MissedListAlert.ts, just a separate collection
// (rather than a `type` field on that model) since the two alerts have
// independent triggers, timing, and audiences (this one reaches employees
// too, not managers only) and can each fire once per list per day
// completely independently of the other.
export interface INotStartedAlert extends Document {
  companyId: string;
  taskListId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD, company-local
  sentAt: Date;
}

const NotStartedAlertSchema = new Schema<INotStartedAlert>(
  {
    companyId: { type: String, required: true, index: true },
    taskListId: { type: Schema.Types.ObjectId, ref: "TaskList", required: true },
    date: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

NotStartedAlertSchema.index({ companyId: 1, taskListId: 1, date: 1 }, { unique: true });

export default models.NotStartedAlert || model<INotStartedAlert>("NotStartedAlert", NotStartedAlertSchema);
