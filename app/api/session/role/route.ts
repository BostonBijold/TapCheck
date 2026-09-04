import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lightweight session lookup for client code with no server-rendered
// session context of its own — currently just
// components/NativeBootstrap.tsx's shift-window alert push registration,
// gated on having a companyId at all (any signed-in company user, manager
// or employee — see docs/features/notifications.md's "Device
// registration"). `role` is returned too, even though that registration
// gate no longer uses it, in case a future caller needs it. Deliberately
// tiny: no other client code should grow a habit of polling this instead
// of receiving role/companyId as a prop from its page, the way every other
// gated screen already does.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ role: null, companyId: null });
  return NextResponse.json({ role: sessionUser.role, companyId: sessionUser.companyId });
}
