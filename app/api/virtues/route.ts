import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import { resolveSelectedPhilosophyId } from "@/lib/philosophy";
import VirtueModel from "@/models/Virtue";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(id?: string | null) {
  return id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
}

// GET /api/virtues — scoped server-side to the caller's own
// User.selectedPhilosophyId (never a client-sent param, same trust model as
// userId everywhere else in this app). Returns [] if the user has no
// philosophy selected yet, rather than erroring — the UI never actually
// calls this in that state (the marketplace replaces the check-in flow),
// but it's a safe default regardless.
//
// Optional ?philosophyId= override, admin-only — lets the management sheet
// browse any philosophy's virtues (including inactive ones), not just the
// caller's own selection.
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const requestedPhilosophyId = req.nextUrl.searchParams.get("philosophyId");
  const admin = isAdmin(session?.user?.email);

  let philosophyId: string | null;
  let activeOnly = true;
  if (requestedPhilosophyId && admin) {
    philosophyId = requestedPhilosophyId;
    activeOnly = false; // management sheet needs to see soft-deleted virtues too
  } else {
    philosophyId = await resolveSelectedPhilosophyId(userId);
  }

  if (!philosophyId) return NextResponse.json([]);

  const virtues = await VirtueModel.find({
    philosophyId,
    ...(activeOnly ? { isActive: true } : {}),
  })
    .sort({ order: 1 })
    .lean();

  return NextResponse.json(
    virtues.map((v) => ({
      _id: v._id.toString(),
      philosophyId: v.philosophyId.toString(),
      name: v.name,
      slug: v.slug,
      tagline: v.tagline,
      displayName: v.displayName,
      order: v.order,
      essay: v.essay,
      etymology: v.etymology,
      isActive: v.isActive,
    }))
  );
}

// POST /api/virtues — admin-only. Adds a virtue to an existing philosophy.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { philosophyId, name, slug, tagline, displayName, essay, etymology, order } = await req.json() as {
    philosophyId?: string; name?: string; slug?: string; tagline?: string;
    displayName?: string; essay?: string; etymology?: string; order?: number;
  };

  if (!philosophyId || !name?.trim() || !slug?.trim() || !tagline?.trim() || !displayName?.trim()) {
    return NextResponse.json(
      { error: "philosophyId, name, slug, tagline, and displayName required" },
      { status: 400 }
    );
  }

  await connectDB();

  const existingSlug = await VirtueModel.findOne({ slug: slug.trim() }).lean();
  if (existingSlug) {
    return NextResponse.json({ error: "That slug is already in use" }, { status: 400 });
  }

  const nextOrder = order ?? (await VirtueModel.countDocuments({ philosophyId })) + 1;

  const virtue = await VirtueModel.create({
    philosophyId,
    name: name.trim(),
    slug: slug.trim(),
    tagline: tagline.trim(),
    displayName: displayName.trim(),
    order: nextOrder,
    essay: essay?.trim() ?? "",
    etymology: etymology?.trim() ?? "",
    isActive: true,
  });

  return NextResponse.json(
    {
      _id: virtue._id.toString(),
      philosophyId: virtue.philosophyId.toString(),
      name: virtue.name,
      slug: virtue.slug,
      tagline: virtue.tagline,
      displayName: virtue.displayName,
      order: virtue.order,
      essay: virtue.essay,
      etymology: virtue.etymology,
      isActive: virtue.isActive,
    },
    { status: 201 }
  );
}
