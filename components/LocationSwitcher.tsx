"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

interface Location {
  _id: string;
  name: string;
}

interface Props {
  isOwner: boolean;
  // The resolved value this page is currently using — for Tasks/Reports/
  // Inventory, pass the already-resolved location (pickActiveLocationId's
  // result, never null); for Team (allowAll), pass the raw
  // sessionUser.activeLocationId (null = "All Locations"). See
  // docs/features/locations.md's "Location switcher".
  activeLocationId: string | null;
  // Team-only: offers "All Locations" as a selectable entry, which PATCHes
  // activeLocationId back to null (today's default, unfiltered roster) —
  // see docs/features/locations.md's "Location switcher".
  allowAll?: boolean;
  // Called after a successful PATCH, in addition to (not instead of) the
  // router.refresh() below. Needed by any page whose data comes from a
  // client-side fetch-on-mount rather than server-rendered props (Team's
  // fetchTeam, Inventory's fetchAll) — router.refresh() alone only re-runs
  // the server component, which doesn't re-trigger an effect that already
  // ran once on mount. Tasks' data comes from server props, so it has no
  // need for this.
  onChanged?: () => void;
}

// Manager/employee never see this (no switcher, by design — see
// lib/session.ts's pickActiveLocationId), and neither does an owner at a
// single-location company, since there's nothing to switch between.
export default function LocationSwitcher({ isOwner, activeLocationId, allowAll, onChanged }: Props) {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [isOwner]);

  if (!isOwner || !locations || locations.length < 2) return null;

  const handleChange = async (value: string) => {
    const nextLocationId = value === "__all__" ? null : value;
    if (nextLocationId === activeLocationId || saving) return;
    setSaving(true);
    try {
      await fetch("/api/session/active-location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: nextLocationId }),
      });
      router.refresh();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-4 -mt-1">
      <MapPin size={13} className="text-dim flex-shrink-0" />
      <select
        value={activeLocationId ?? "__all__"}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="flex-1 min-w-0 bg-card border border-border rounded-pill px-3 py-1.5 font-mono text-xs text-text outline-none focus:border-olive disabled:opacity-60"
      >
        {allowAll && <option value="__all__">All Locations</option>}
        {locations.map((loc) => (
          <option key={loc._id} value={loc._id}>
            {loc.name}
          </option>
        ))}
      </select>
    </div>
  );
}
