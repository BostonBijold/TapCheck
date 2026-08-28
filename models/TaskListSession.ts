import mongoose, { Schema, Document, model, models } from "mongoose";

export type TaskListSessionStatus = "in_progress" | "completed";
export type CompletionState = "done" | "missed" | "rest";

export interface ICompletionEntry {
  taskId: mongoose.Types.ObjectId;
  completedAt: Date;
  state: CompletionState;
}

export interface ITaskListSession extends Document {
  // String, not ObjectId, matching every other model's companyId (TaskLog,
  // Task, TaskList) — this is the id a session or API key resolves to, and
  // SKIP_AUTH's local dev company isn't a valid ObjectId at all, so it must
  // stay a plain string here too.
  companyId: string;
  // Who started this particular session run — an attribute, not part of the
  // lookup key: the list/date lookup below is company-wide (any employee
  // can pick up an already-open session), same reasoning as
  // TaskLog.performedByUserId. Null means an open session a manager has
  // unlocked — see lib/task-list-session-actions.ts's unlockSession — and
  // acts as "up for grabs": the next person to touch a task in this list
  // claims it, same as a brand-new session's first touch.
  performedByUserId: string | null;
  taskListId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  startedAt: Date;
  completedAt: Date | null;
  status: TaskListSessionStatus;
  totalActualMinutes: number;
  completionSequence: ICompletionEntry[];
  pauseOrJumpCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CompletionEntrySchema = new Schema<ICompletionEntry>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    completedAt: { type: Date, required: true },
    state: { type: String, enum: ["done", "missed", "rest"], required: true },
  },
  { _id: false }
);

const TaskListSessionSchema = new Schema<ITaskListSession>(
  {
    companyId: { type: String, required: true },
    performedByUserId: { type: String, default: null },
    taskListId: { type: Schema.Types.ObjectId, ref: "TaskList", required: true },
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

// No unique index — a list can legitimately be started, finished, and
// started again the same day (e.g. redoing it), and each run gets its own
// session record rather than colliding with the last one. This index just
// makes "find the open session for this company/list/date" (the lookup
// every write path below needs) cheap.
TaskListSessionSchema.index({ companyId: 1, taskListId: 1, date: 1, status: 1 });

export default models.TaskListSession || model<ITaskListSession>("TaskListSession", TaskListSessionSchema);
