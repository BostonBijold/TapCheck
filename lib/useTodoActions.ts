"use client";

import { useCallback } from "react";
import type { TodoEntry } from "@/components/TodoSection";

// Shared mutation logic for the standalone To-Do list, used by both
// RoutinesView (today + overdue carry-forward) and GoalsView (future
// backlog) — the two views differ only in which todos they fetch and in
// which items remain visible after an edit, both captured by `isVisible`.
export function useTodoActions(
  todos: TodoEntry[],
  setTodos: React.Dispatch<React.SetStateAction<TodoEntry[]>>,
  isVisible: (todo: TodoEntry) => boolean
) {
  const toggle = useCallback(
    async (id: string, done: boolean) => {
      const previous = todos;
      setTodos((prev) =>
        prev.map((t) => (t._id === id ? { ...t, done, completedAt: done ? new Date().toISOString() : null } : t))
      );
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) setTodos(previous);
    },
    [todos, setTodos]
  );

  const remove = useCallback(
    async (id: string) => {
      const previous = todos;
      setTodos((prev) => prev.filter((t) => t._id !== id));
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) setTodos(previous);
    },
    [todos, setTodos]
  );

  const update = useCallback(
    async (id: string, updates: { name: string; scheduledDate: string; estimatedMinutes: number | null }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      const saved: TodoEntry = await res.json();
      setTodos((prev) => {
        if (!isVisible(saved)) return prev.filter((t) => t._id !== id);
        return prev.map((t) => (t._id === id ? saved : t));
      });
    },
    [setTodos, isVisible]
  );

  return { toggle, remove, update };
}
