import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import NfcTag from "@/models/NfcTag";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// DELETE /api/nfc-tags/[id] — unlink (hard delete). A future tap of the
// same physical tag just re-registers it as unassigned.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const tag = await NfcTag.findOneAndDelete({ _id: params.id, userId });
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
