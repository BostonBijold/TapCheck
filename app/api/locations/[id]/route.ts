import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Location from "@/models/Location";
import { resolveSessionUser, isOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

// PATCH /api/locations/[id] — owner-only: rename/re-address/re-zone a
// location. See docs/features/locations.md.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  await connectDB();

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    updates.name = name.trim();
  }
  if (address !== undefined) updates.address = address?.trim() || null;
  if (timezone !== undefined) updates.timezone = timezone || null;

  const location = await Location.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: updates },
    { returnDocument: "after" }
  );
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: location._id.toString(),
    name: location.name,
    address: location.address,
    timezone: location.timezone,
  });
}

// DELETE /api/locations/[id] — owner-only soft-delete (isActive: false),
// same convention as TaskList — its historical TaskLog/InventoryLog/
// TaskListSession rows stay intact.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isOwner(role)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  await connectDB();

  const location = await Location.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: { isActive: false } },
    { returnDocument: "after" }
  );
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
