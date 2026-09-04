"use client";

import { useCallback, useEffect, useState } from "react";
import TeamTable from "@/components/console/TeamTable";
import InvitePanel from "@/components/console/InvitePanel";

interface Member {
  _id: string;
  name: string;
  role: "manager" | "employee" | "owner";
  joinedAt: string | null;
  locationId: string | null;
}

interface Invite {
  _id: string;
  role: "manager" | "employee";
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
}

interface LocationOption {
  _id: string;
  name: string;
}

// Page-level coordinator for /console/team — holds the roster/invites/
// locations state both TeamTable and InvitePanel need, and wires their
// callbacks to the same existing API routes the mobile Team tab uses (see
// docs/features/admin-console.md's Phase 1b: "Reuses existing APIs... zero
// net-new API work" beyond the location-reassignment wiring itself).
export default function TeamConsoleView({ currentUserId }: { currentUserId: string }) {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const fetchTeam = useCallback(() => {
    fetch("/api/team").then((r) => r.json()).then(setTeam).catch(() => setTeam([]));
  }, []);

  const fetchInvites = useCallback(() => {
    fetch("/api/invites").then((r) => r.json()).then(setInvites).catch(() => setInvites([]));
  }, []);

  useEffect(() => {
    fetchTeam();
    fetchInvites();
    // Always fetched here (unlike TeamView.tsx's mobile owner-only guard) —
    // every console user is an owner, and both TeamTable's reassignment
    // dropdown and InvitePanel's location picker need the full list.
    fetch("/api/locations").then((r) => r.json()).then(setLocations).catch(() => setLocations([]));
  }, [fetchTeam, fetchInvites]);

  const handleChangeRole = async (userId: string, role: "manager" | "employee") => {
    await fetch(`/api/team/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    fetchTeam();
  };

  const handleReassignLocation = async (userId: string, locationId: string) => {
    await fetch(`/api/team/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    fetchTeam();
  };

  const handleRemove = async (userId: string) => {
    await fetch(`/api/team/${userId}`, { method: "DELETE" });
    fetchTeam();
  };

  const handleRevoke = async (id: string) => {
    await fetch(`/api/invites/${id}`, { method: "DELETE" });
    setInvites((prev) => (prev ? prev.filter((i) => i._id !== id) : prev));
  };

  return (
    <div>
      <h1 className="font-heading text-2xl text-text mb-1">Team &amp; Access</h1>
      <p className="font-body text-sm text-muted mb-6">Every teammate across every location, in one table.</p>
      <TeamTable
        team={team}
        locations={locations}
        currentUserId={currentUserId}
        onChangeRole={handleChangeRole}
        onReassignLocation={handleReassignLocation}
        onRemove={handleRemove}
      />
      <InvitePanel locations={locations} invites={invites} onGenerated={fetchInvites} onRevoke={handleRevoke} />
    </div>
  );
}
