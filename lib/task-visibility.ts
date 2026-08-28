// Day-of-week visibility gate — a task with scheduledDays excluding today's
// day-of-week doesn't render on the Tasks page for today at all.
//
// A TaskList pushes its own scheduledDays down onto every task in it
// whenever a manager changes the list's schedule (see PATCH
// /api/task-lists/[taskListId]) — so gating on each task's OWN
// scheduledDays automatically produces "a not-scheduled list's tasks don't
// display today" for free, with no separate list-level check needed here:
// a task still shows despite its list being off today only if that one
// task was individually re-customized afterward to include today, which is
// exactly the escape hatch the product wants.
//
// This is a deliberate simplification (documented per the brief): it
// applies uniformly to every task, not only ones inside a list a manager
// has scheduled — a standalone task that already had a custom schedule
// before this feature existed now also disappears on its off days, instead
// of merely showing a "not scheduled" dot while still being tappable.
export function isTaskVisibleOn(
  task: { scheduledDays?: number[] },
  dateStr: string
): boolean {
  const scheduledDays = task.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
  const dow = new Date(dateStr + "T12:00:00").getDay();
  return scheduledDays.includes(dow);
}
