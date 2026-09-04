import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Location from "@/models/Location";
import { resolveSessionUser, isOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/locations — this company's active locations, open to any
// signed-in company user (an employee/manager only ever sees their own via
// their User.locationId, but the location switcher and invite-creation
// picker both need the full list, and neither of those is owner-only to
// simply READ). See docs/features/locations.md.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const locations = await Location.find({ companyId, isActive: true }).sort({ name: 1 }).lean();

  return NextResponse.json(
    locations.map((l) => ({
      _id: l._id.toString(),
      name: l.name,
      address: l.address ?? null,
      timezone: l.timezone ?? null,
    }))
  );
}

// POST /api/locations — owner-only: spins up a new store under this
// company. Not something a location manager should be able to do — see
// docs/features/locations.md's Permissions audit.
export async function POST(req: Request) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isOwner(role)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { name, address, timezone } = (await req.json()) as {
    name?: string;
    address?: string | null;
    timezone?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  await connectDB();

  const location = await Location.create({
    companyId,
    name: name.trim(),
    address: address?.trim() || null,
    timezone: timezone || null,
  });

  return NextResponse.json({
    _id: location._id.toString(),
    name: location.name,
    address: location.address,
    timezone: location.timezone,
  });
}
