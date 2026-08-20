import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import VirtueModel from "@/models/Virtue";
import { currentVirtueOrder } from "@/lib/seed-virtues";
import { resolveSelectedPhilosophyId } from "@/lib/philosophy";
import { isAdmin as checkIsAdmin } from "@/lib/admin";
import VirtueDetailView from "@/components/VirtueDetailView";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

export default async function VirtueDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  await connectDB();

  const virtue = await VirtueModel.findOne({ slug: params.slug, isActive: true }).lean();
  if (!virtue) notFound();

  const isAdmin = skipAuth || checkIsAdmin(session?.user?.email);

  const virtueCount = await VirtueModel.countDocuments({
    philosophyId: virtue.philosophyId,
    isActive: true,
  });

  // "This Week" only applies if the viewed virtue belongs to the philosophy
  // the user actually has selected right now — otherwise browsing to a
  // different philosophy's virtue at the same order via a direct link would
  // incorrectly show the pill.
  const selectedPhilosophyId = await resolveSelectedPhilosophyId(userId);
  const isCurrent =
    !!selectedPhilosophyId &&
    selectedPhilosophyId === virtue.philosophyId.toString() &&
    virtue.order === currentVirtueOrder(new Date(), virtueCount);

  return (
    <VirtueDetailView
      virtue={{
        _id: virtue._id.toString(),
        name: virtue.name,
        slug: virtue.slug,
        tagline: virtue.tagline,
        displayName: virtue.displayName,
        order: virtue.order,
        essay: virtue.essay ?? "",
        etymology: virtue.etymology ?? "",
      }}
      isAdmin={isAdmin}
      isCurrent={isCurrent}
      virtueCount={virtueCount}
    />
  );
}
