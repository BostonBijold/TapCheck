import { redirect } from "next/navigation";
import { resolveSessionUser, isOwner } from "@/lib/session";

// /console has no landing content of its own. An owner lands on Locations —
// the thinnest, first-built slice (see docs/features/admin-console.md's
// "Dependency ordering") — while a manager, who can't see Locations at all,
// lands on Task Management instead. See
// docs/features/console-task-management.md's "Required change: the console
// is no longer owner-only".
export default async function ConsoleIndexPage() {
  const sessionUser = await resolveSessionUser();
  redirect(sessionUser && isOwner(sessionUser.role) ? "/console/locations" : "/console/tasks");
}
