import TaskManagementView from "@/components/console/TaskManagementView";

export const dynamic = "force-dynamic";

// Manager-or-above (see docs/features/console-task-management.md) — the
// one console page an owner and a manager both reach. No server-fetched
// props: TaskManagementView fetches GET /api/task-lists and
// GET /api/task-definitions itself client-side, same convention as every
// other console page (LocationsTable, TeamConsoleView, RollupTable).
export default function ConsoleTasksPage() {
  return <TaskManagementView />;
}
