import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { isAdmin } from "@/lib/admin";
import Philosophy from "@/models/Philosophy";
import Virtue from "@/models/Virtue";

export const dynamic = "force-dynamic";

// POST /api/philosophies/[id]/duplicate — admin-only. Deep-copies the
// source philosophy's active virtues into a brand-new philosophy (fresh
// _ids, new philosophyId, same order/displayName/tagline/essay/etymology) —
// not references. A useful starting point for a new philosophy.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, slug } = await req.json() as { name?: string; slug?: string };
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }

  await connectDB();

  const source = await Philosophy.findById(params.id).lean();
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existingSlug = await Philosophy.findOne({ slug: slug.trim() }).lean();
  if (existingSlug) {
    return NextResponse.json({ error: "That slug is already in use" }, { status: 400 });
  }

  const maxOrder = await Philosophy.findOne().sort({ order: -1 }).lean();
  const copy = await Philosophy.create({
    name: name.trim(),
    slug: slug.trim(),
    description: source.description,
    isSystem: false, // a duplicate is always admin-created, even if the source was a system philosophy
    isActive: true,
    order: maxOrder ? maxOrder.order + 1 : 0,
  });

  const sourceVirtues = await Virtue.find({ philosophyId: source._id, isActive: true })
    .sort({ order: 1 })
    .lean();

  if (sourceVirtues.length > 0) {
    await Virtue.insertMany(
      sourceVirtues.map((v) => ({
        philosophyId: copy._id,
        name: v.name,
        slug: `${v.slug}-${copy.slug}`, // slugs are globally unique; disambiguate the copy
        tagline: v.tagline,
        displayName: v.displayName,
        order: v.order,
        essay: v.essay,
        etymology: v.etymology,
        isActive: true,
      }))
    );
  }

  return NextResponse.json(
    {
      _id: copy._id.toString(),
      name: copy.name,
      slug: copy.slug,
      description: copy.description,
      isSystem: copy.isSystem,
      isActive: copy.isActive,
      order: copy.order,
      virtueCount: sourceVirtues.length,
    },
    { status: 201 }
  );
}
