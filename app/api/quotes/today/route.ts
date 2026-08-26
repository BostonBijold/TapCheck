import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { getQuoteForToday } from "@/lib/quote-selection";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(id?: string | null) {
  return id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
}

// GET /api/quotes/today?date=YYYY-MM-DD — used only by the loading screen.
// `date` should be the caller's local date (same convention as
// /routines?date=) — falls back to server UTC date if omitted.
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const quote = await getQuoteForToday(userId, date);

  return NextResponse.json({ quote });
}
