import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resolveSessionUser, isOwner } from "@/lib/session";
import { validateLocationId } from "@/lib/locations";

export const dynamic = "force-dynamic";

// PATCH /api/session/active-location — owner-only: sets this owner's
// location-switcher selection (see docs/features/locations.md's "Location
// switcher"). Owner-gated because employee/manager have no switcher —
// pickActiveLocationId in lib/session.ts always uses their own locationId
// regardless of this field.
export async function PATCH(req: Request) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isOwner(role)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { locationId } = (await req.json()) as { locationId?: string | null };

  await connectDB();

  // Same silent-fallback-to-null convention as every other call site of
  // this helper (e.g. app/api/task-logs/route.ts) — an invalid/foreign id
  // just resolves to "no override" rather than a 400, and `null`/undefined
  // in the request body is exactly the "clear the override, back to
  // whichever default this page normally uses" case, not an error.
  const validated = await validateLocationId(companyId, locationId);

  await User.findByIdAndUpdate(userId, { $set: { activeLocationId: validated } });

  return NextResponse.json({ activeLocationId: validated });
}
