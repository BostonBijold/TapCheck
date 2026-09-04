import RollupTable from "@/components/console/RollupTable";

export const dynamic = "force-dynamic";

// Phase 2 — see docs/features/admin-console.md. GET /api/reports/rollup
// (app/api/reports/rollup/route.ts) is the net-new backend surface this
// page depends on.
export default function ConsoleRollupPage() {
  return <RollupTable />;
}
