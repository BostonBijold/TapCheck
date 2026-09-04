// Pure role-tier helpers — no server-only imports (unlike lib/session.ts,
// which pulls in @/lib/auth and mongoose), so client components can import
// this directly instead of pulling those into the browser bundle.
// lib/session.ts re-exports these for server-side call sites.

export type UserRole = "manager" | "employee" | "owner";

// "manager or above" — the gate every existing manager-only surface used to
// spell as `role === "manager"` / `role !== "manager"`. `owner` is a strict
// superset of `manager` (see docs/features/locations.md's Role tiers), so
// every one of those checks widens to this instead of a parallel
// owner-only UI path.
export function isManagerOrAbove(role: UserRole): boolean {
  return role === "manager" || role === "owner";
}

// A couple of actions (creating a Location, reassigning a teammate between
// locations) are gated tighter than plain "manager or above" — see
// docs/features/locations.md's Permissions audit.
export function isOwner(role: UserRole): boolean {
  return role === "owner";
}
