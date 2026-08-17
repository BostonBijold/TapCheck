import { Schema, Document, model, models } from "mongoose";

// Standalone to-do for a given day — not tied to a Goal. Distinct from
// Goal.milestones[].tasks[], which are goal-linked and surfaced by due date
// separately.
export interface ITodo extends Document {
  userId: string;
  name: string;
  scheduledDate: string; // YYYY-MM-DD
  done: boolean;
  completedAt: Date | null;
  estimatedMinutes: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
}

const TodoSchema = new Schema<ITodo>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    scheduledDate: { type: String, required: true },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    estimatedMinutes: { type: Number, default: null },
    note: { type: String, default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TodoSchema.index({ userId: 1, scheduledDate: 1 });

export default models.Todo || model<ITodo>("Todo", TodoSchema);

// Todos due on `date`, plus any earlier undone todos that carry forward as
// overdue. Once a todo is marked done it stops carrying forward — it stays
// visible only when browsing back to its original scheduledDate.
export function todosForDateQuery(userId: string, date: string) {
  return {
    userId,
    $or: [{ scheduledDate: date }, { scheduledDate: { $lt: date }, done: false }],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeTodo(t: any) {
  return {
    _id: t._id.toString(),
    name: t.name,
    scheduledDate: t.scheduledDate,
    done: t.done ?? false,
    completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
    estimatedMinutes: t.estimatedMinutes ?? null,
    note: t.note ?? null,
  };
}
