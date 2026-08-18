import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { getOrCreateApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

// Returns the signed-in user's external API key, generating one on first
// request if they don't have one yet. Used by the Profile page.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const apiKey = await getOrCreateApiKey(userId);
  return NextResponse.json({ apiKey });
}
