import mongoose, { Schema, Document, model, models } from "mongoose";

// Not a "link" to any one Shortcut — there's no per-Shortcut identifier to
// register, since Apple's App Intents give no hook for "user configured a
// Shortcut with this parameter," only for when it actually runs. This is a
// usage marker: the first (and every subsequent) time TriggerHabitIntent
// (ios/App/App/AppIntents) fires for a habit, POST /api/external/trigger-habit
// upserts one of these, so Manage Habit can show "connected via Shortcut"
// without pretending to track individual Shortcuts. One per (userId,
// routineItemId) — a habit can be picked by any number of different
// Shortcuts simultaneously; this just reflects that it's been used at all.
// See docs/features/app-intents.md.
export interface IAppIntentLink extends Document {
  userId: string;
  routineItemId: mongoose.Types.ObjectId;
  lastTriggeredAt: Date;
}

const AppIntentLinkSchema = new Schema<IAppIntentLink>(
  {
    userId: { type: String, required: true, index: true },
    routineItemId: { type: Schema.Types.ObjectId, ref: "RoutineItem", required: true },
    lastTriggeredAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true }
);

AppIntentLinkSchema.index({ userId: 1, routineItemId: 1 }, { unique: true });

export default models.AppIntentLink || model<IAppIntentLink>("AppIntentLink", AppIntentLinkSchema);
