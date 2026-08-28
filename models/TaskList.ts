import { Schema, Document, model, models } from "mongoose";

export interface ITaskList extends Document {
  companyId: string;
  name: string;
  timeOfDay: "morning" | "evening" | "custom" | "anytime";
  startTime: string | null;    // 'HH:MM' — when the task list's window opens (end is derived from projected mins)
  order: number;
  isDefault: boolean;
  // Soft-delete flag, same convention as Task.isActive — a removed list
  // drops out of the active set (and off the Tasks page) but its history
  // (TaskLog/TaskListSession records referencing it) is left untouched.
  isActive: boolean;
  // List-level default for each task's own scheduledDays — pushed down onto
  // every task in the list whenever this changes (see lib/seed.ts and the
  // task-lists API route). A task can still be edited afterward to diverge
  // from this default; it's a default-then-override relationship, not a
  // hard lock. Defaults to every day so existing lists are unaffected until
  // a manager opts in.
  scheduledDays: number[];
}

const TaskListSchema = new Schema<ITaskList>(
  {
    // Company's shared task-list configuration — not any individual's
    // personal data. String, not ObjectId, matching every other model's
    // company/user id fields — this travels as the string a session or API
    // key resolves to, and SKIP_AUTH's dev company id isn't a valid ObjectId
    // at all, so it must stay a plain string here too.
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    timeOfDay: { type: String, enum: ["morning", "evening", "custom", "anytime"], required: true },
    startTime: { type: String, default: null },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    scheduledDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  },
  { timestamps: true }
);

export default models.TaskList || model<ITaskList>("TaskList", TaskListSchema);
