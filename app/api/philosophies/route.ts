import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import Philosophy from "@/models/Philosophy";
import Virtue from "@/models/Virtue";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(id?: string | null) {
  return id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
}

// GET /api/philosophies — admins see every philosophy (active + inactive,
// for the management sheet); everyone else sees isActive: true only (the
// marketplace). Each row is annotated with a computed virtueCount — never
// stored, always counted fresh so it can't drift out of sync.
export async function GET() {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const admin = isAdmin(session?.user?.email);
  const philosophies = await Philosophy.find(admin ? {} : { isActive: true })
    .sort({ order: 1 })
    .lean();

  const counts = await Virtue.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$philosophyId", count: { $sum: 1 } } },
  ]);
  const countByPhilosophy = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return NextResponse.json(
    philosophies.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      slug: p.slug,
      description: p.description,
      isSystem: p.isSystem,
      isActive: p.isActive,
      order: p.order,
      virtueCount: countByPhilosophy.get(p._id.toString()) ?? 0,
    }))
  );
}

// POST /api/philosophies — admin-only. Creates an empty philosophy (no
// virtues yet) — add those via POST /api/virtues afterward.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, slug, description, order } = await req.json() as {
    name?: string; slug?: string; description?: string; order?: number;
  };

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }

  await connectDB();

  const existing = await Philosophy.findOne({ slug: slug.trim() }).lean();
  if (existing) {
    return NextResponse.json({ error: "That slug is already in use" }, { status: 400 });
  }

  const maxOrder = await Philosophy.findOne().sort({ order: -1 }).lean();
  const philosophy = await Philosophy.create({
    name: name.trim(),
    slug: slug.trim(),
    description: description?.trim() ?? "",
    isSystem: false,
    isActive: true,
    order: order ?? (maxOrder ? maxOrder.order + 1 : 0),
  });

  return NextResponse.json(
    {
      _id: philosophy._id.toString(),
      name: philosophy.name,
      slug: philosophy.slug,
      description: philosophy.description,
      isSystem: philosophy.isSystem,
      isActive: philosophy.isActive,
      order: philosophy.order,
      virtueCount: 0,
    },
    { status: 201 }
  );
}
