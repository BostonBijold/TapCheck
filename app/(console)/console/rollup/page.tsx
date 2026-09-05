import { redirect } from "next/navigation";
import { resolveSessionUser, isOwner } from "@/lib/session";
import RollupTable from "@/components/console/RollupTable";

export const dynamic = "force-dynamic";

// Phase 2 — see docs/features/admin-console.md. GET /api/reports/rollup
// (app/api/reports/rollup/route.ts) is the net-new backend surface this
// page depends on. Owner-only — see the matching note on
// console/locations/page.tsx for why this page now checks for itself.
export default async function ConsoleRollupPage() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser || !isOwner(sessionUser.role)) redirect("/console/tasks");

  return <RollupTable />;
}
