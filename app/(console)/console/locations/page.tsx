import LocationsTable from "@/components/console/LocationsTable";

export const dynamic = "force-dynamic";

// Phase 1a — thinnest slice, existing /api/locations endpoints only. See
// docs/features/admin-console.md.
export default function ConsoleLocationsPage() {
  return (
    <div>
      <h1 className="font-heading text-2xl text-text mb-1">Locations</h1>
      <p className="font-body text-sm text-muted mb-6">Every active store under your company.</p>
      <LocationsTable />
    </div>
  );
}
