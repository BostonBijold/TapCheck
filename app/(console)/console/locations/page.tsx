import { redirect } from "next/navigation";
import { resolveSessionUser, isOwner } from "@/lib/session";
import LocationsTable from "@/components/console/LocationsTable";

export const dynamic = "force-dynamic";

// Phase 1a — thinnest slice, existing /api/locations endpoints only. See
// docs/features/admin-console.md. Owner-only — the blanket console gate
// loosened to manager-or-above once Task Management shipped (see
// docs/features/console-task-management.md), so this page checks for
// itself now rather than relying on the layout.
export default async function ConsoleLocationsPage() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser || !isOwner(sessionUser.role)) redirect("/console/tasks");

  return (
    <div>
      <h1 className="font-heading text-2xl text-text mb-1">Locations</h1>
      <p className="font-body text-sm text-muted mb-6">Every active store under your company.</p>
      <LocationsTable />
    </div>
  );
}
