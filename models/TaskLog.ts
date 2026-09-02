import mongoose, { Schema, Document, model, models } from "mongoose";
import type { FormFieldValue } from "@/models/TaskDefinition";

export type LogState = "in_progress" | "paused" | "done" | "missed" | "rest";

export interface ITaskLog extends Document {
  companyId: string;
  // Which specific user actually did the task — an attribute, not part of
  // the uniqueness key: any employee on shift might complete a given task,
  // so the meaningful uniqueness is one log per task per day for the whole
  // company (see the index below), not per user.
  performedByUserId: string;
  taskId: mongoose.Types.ObjectId;
  date: string;              // YYYY-MM-DD
  actualMinutes?: number;    // null if missed/rest; derived from timestamps on timer completions
  startedAt?: Date;          // set when state → in_progress; null while paused
  completedAt?: Date;        // set when state → done via timer
  // Elapsed seconds banked from prior running segments of this same log —
  // e.g. jumping away from a task inside a Task List Session pauses it and
  // banks whatever it had accumulated so far, rather than completing it.
  // Total elapsed while running = pausedSeconds + (now - startedAt).
  pausedSeconds: number;
  state: LogState;
  note?: string;
  isBackEntry: boolean;
  // Set only while state === "in_progress" and this timer was started with
  // a taskListId — set by TaskListSessionView.tsx's own per-item effect
  // when a session's task starts (the primary path; a now-deleted external
  // API used to be able to set it too, for anchoring a session on an
  // anytime list specifically, see docs/features/anytime-tasks.md). Tells
  // the client to reopen this task inside a Task List Session for that list
  // on resume, instead of the standalone timer. Cleared whenever the log
  // leaves in_progress.
  sessionTaskListId?: mongoose.Types.ObjectId | null;
  // Set only on the terminal log for a "form" task (see
  // components/TaskFormScreen.tsx) — every other log leaves this null.
  formData?: Record<string, FormFieldValue> | null;
  // NFC/card identifier that triggered this log, if any — populated when a
  // log is started via a tag-triggered external path; null for an in-app
  // manual start. Field exists ahead of the NFC reader itself (separate
  // work) so this isn't a later migration.
  tagId?: string | null;
  createdAt: Date;
}

const TaskLogSchema = new Schema<ITaskLog>(
  {
    companyId: { type: String, required: true, index: true },
    performedByUserId: { type: String, required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    date: { type: String, required: true },
    actualMinutes: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    pausedSeconds: { type: Number, default: 0 },
    state: { type: String, enum: ["in_progress", "paused", "done", "missed", "rest"], required: true },
    note: { type: String, default: null },
    isBackEntry: { type: Boolean, default: false },
    sessionTaskListId: { type: Schema.Types.ObjectId, ref: "TaskList", default: null },
    formData: { type: Schema.Types.Mixed, default: null },
    tagId: { type: String, default: null },
  },
  { timestamps: true }
);

TaskLogSchema.index({ companyId: 1, date: 1 });
// One log per task per day for the whole company — not per user, since any
// employee on shift might complete a given task (performedByUserId is
// stored as an attribute on that single log, not part of this key).
TaskLogSchema.index({ companyId: 1, taskId: 1, date: 1 }, { unique: true });
// Supports the Reports Logs tab's per-employee date-range history query
// (GET /api/task-logs/history) and lib/streak.ts's backward day-by-day
// walk — neither existing index above covers performedByUserId, so either
// would collection-scan without this one.
TaskLogSchema.index({ companyId: 1, performedByUserId: 1, date: 1 });

export default models.TaskLog || model<ITaskLog>("TaskLog", TaskLogSchema);
