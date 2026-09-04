import mongoose, { Schema, Document, model, models } from "mongoose";

// Exists purely to make the missed-shift-list sweep (see
// docs/features/notifications.md and app/api/cron/check-missed-lists)
// idempotent: without this row, a job running every 15 minutes would
// re-alert on the same still-incomplete list every single run. The unique
// index below is the actual dedup guard; a row is written BEFORE the push
// fan-out (write-then-send), so a crash mid-send can't cause a duplicate
// alert on the next run. Doubles as a lightweight audit trail for free —
// "did the alert fire, and when."
export interface IMissedListAlert extends Document {
  companyId: string;
  taskListId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD, company-local
  sentAt: Date;
}

const MissedListAlertSchema = new Schema<IMissedListAlert>(
  {
    companyId: { type: String, required: true, index: true },
    taskListId: { type: Schema.Types.ObjectId, ref: "TaskList", required: true },
    date: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MissedListAlertSchema.index({ companyId: 1, taskListId: 1, date: 1 }, { unique: true });

export default models.MissedListAlert || model<IMissedListAlert>("MissedListAlert", MissedListAlertSchema);
