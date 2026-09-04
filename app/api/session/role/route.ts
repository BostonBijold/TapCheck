import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lightweight role check for client code with no server-rendered session
// context of its own — currently just components/NativeBootstrap.tsx's
// missed-list push-notification registration, gated to managers only (see
// docs/features/notifications.md's "Device registration"). Deliberately
// tiny: no other client code should grow a habit of polling this instead
// of receiving role as a prop from its page, the way every other
// role-gated screen already does.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ role: null, companyId: null });
  return NextResponse.json({ role: sessionUser.role, companyId: sessionUser.companyId });
}
