import { redirect } from "next/navigation";
import { resolveSessionUser, isOwner } from "@/lib/session";
import RollupTable from "@/components/console/RollupTable";

export const dynamic = "force-dynamic";

// The Rollup Dashboard is now /console's own landing content, not a
// separate sidebar page (see docs/features/admin-console.md) — an owner's
// first screen is the cross-location snapshot. A manager, who can't see
// this owner-only view, still lands on Task Management instead, unchanged
// from before. GET /api/reports/rollup (app/api/reports/rollup/route.ts)
// is RollupTable's own backend dependency.
export default async function ConsoleIndexPage() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser || !isOwner(sessionUser.role)) redirect("/console/tasks");

  return <RollupTable />;
}
