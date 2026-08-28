import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { getOrCreateApiKey } from "@/lib/api-key";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Returns the signed-in user's external API key, generating one on first
// request if they don't have one yet. Used by the Profile page.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const apiKey = await getOrCreateApiKey(sessionUser.userId);
  return NextResponse.json({ apiKey });
}
