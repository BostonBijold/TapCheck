import mongoose, { Schema, Document, model, models } from "mongoose";

// Not a "link" to any one Shortcut — there's no per-Shortcut identifier to
// register, since Apple's App Intents give no hook for "user configured a
// Shortcut with this parameter," only for when it actually runs. This is a
// usage marker: the first (and every subsequent) time TriggerHabitIntent
// (ios/App/App/AppIntents) fires for a task, POST /api/external/trigger-task
// upserts one of these, so Manage Task List can show "connected via
// Shortcut" without pretending to track individual Shortcuts. One per
// (userId, taskId) — a task can be picked by any number of different
// Shortcuts simultaneously; this just reflects that it's been used at all.
// See docs/features/app-intents.md.
export interface IAppIntentLink extends Document {
  userId: string;
  taskId: mongoose.Types.ObjectId;
  lastTriggeredAt: Date;
}

const AppIntentLinkSchema = new Schema<IAppIntentLink>(
  {
    userId: { type: String, required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    lastTriggeredAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true }
);

AppIntentLinkSchema.index({ userId: 1, taskId: 1 }, { unique: true });

export default models.AppIntentLink || model<IAppIntentLink>("AppIntentLink", AppIntentLinkSchema);
