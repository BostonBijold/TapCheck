"use client";

import { Trash2 } from "lucide-react";

export interface TodoEntry {
  _id: string;
  name: string;
  scheduledDate: string;
  done: boolean;
  completedAt: string | null;
  estimatedMinutes: number | null;
}

interface Props {
  todos: TodoEntry[];
  viewingDate: string; // the date this list is being viewed as of — flags earlier undone todos as overdue
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: TodoEntry) => void;
  onAdd: () => void;
  title?: string;
  emptyLabel?: string;
  // Show each item's scheduled date instead of the overdue line — for lists
  // that span multiple future dates.
  showDates?: boolean;
  // Replace the small header "+ Add" link with a full-width button pinned
  // above the list, always visible (not just on empty state).
  addButtonLabel?: string;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Days between two YYYY-MM-DD strings — parsed at local noon to sidestep DST edge cases.
function daysLate(scheduledDate: string, viewingDate: string) {
  const a = new Date(scheduledDate + "T12:00:00");
  const b = new Date(viewingDate + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default function TodoSection({
  todos, viewingDate, onToggle, onDelete, onEdit, onAdd,
  title = "To-Dos", emptyLabel = "+ Add a to-do for today", showDates = false, addButtonLabel,
}: Props) {
  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
          {title}{todos.length > 0 ? ` · ${doneCount}/${todos.length}` : ""}
        </span>
        <div className="flex-1 h-px bg-border" />
        {!addButtonLabel && (
          <button
            onClick={onAdd}
            className="font-mono text-[10px] text-blue-muted hover:text-blue-muted/80 transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {addButtonLabel && (
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 bg-blue-muted text-text font-body font-medium py-3.5 rounded-card min-h-[44px] mb-3 active:opacity-90 transition-opacity"
        >
          {addButtonLabel}
        </button>
      )}

      {todos.length === 0 ? (
        addButtonLabel ? (
          <p className="font-mono text-xs text-dim text-center py-4">Nothing scheduled yet.</p>
        ) : (
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-5 rounded-card hover:border-blue-muted/40 hover:text-blue-muted transition-colors min-h-[44px]"
          >
            {emptyLabel}
          </button>
        )
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => {
            const isOverdue = !todo.done && todo.scheduledDate < viewingDate;
            return (
              <div
                key={todo._id}
                className={`flex items-center gap-3 rounded-card bg-card px-4 py-3 ${
                  isOverdue ? "border-l-[3px] border-l-burgundy" : todo.done ? "border-l-[3px] border-l-blue-muted" : ""
                }`}
              >
                <button
                  onClick={() => onToggle(todo._id, !todo.done)}
                  aria-label={todo.done ? "Mark not done" : "Mark done"}
                  className={`flex items-center justify-center w-7 h-7 rounded-full border-2 flex-shrink-0 transition-colors ${
                    todo.done
                      ? "bg-blue-muted/20 border-blue-muted text-blue-muted"
                      : isOverdue
                        ? "border-burgundy/50 text-transparent hover:border-burgundy/70"
                        : "border-border-light text-transparent hover:border-blue-muted/50"
                  }`}
                >
                  <span className="text-xs leading-none">✓</span>
                </button>
                <button
                  onClick={() => onEdit(todo)}
                  aria-label="Edit to-do"
                  className="flex-1 min-w-0 text-left"
                >
                  <p
                    className={`font-body text-sm leading-tight ${
                      todo.done ? "text-dim line-through" : isOverdue ? "text-burgundy-light" : "text-text"
                    }`}
                  >
                    {todo.name}
                  </p>
                  {isOverdue ? (
                    <p className="font-mono text-[9px] text-burgundy-light/70 uppercase tracking-widest mt-0.5">
                      {daysLate(todo.scheduledDate, viewingDate)}d overdue
                    </p>
                  ) : showDates ? (
                    <p className="font-mono text-[9px] text-dim uppercase tracking-widest mt-0.5">
                      {fmtDate(todo.scheduledDate)}
                    </p>
                  ) : null}
                </button>
                {todo.estimatedMinutes != null && (
                  <span className="font-mono text-[10px] text-dim flex-shrink-0">
                    {fmtMins(todo.estimatedMinutes)}
                  </span>
                )}
                <button
                  onClick={() => onDelete(todo._id)}
                  aria-label="Delete to-do"
                  className="text-dim hover:text-burgundy-light transition-colors flex-shrink-0 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
