import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineItem from "@/models/RoutineItem";
import VirtueModel from "@/models/Virtue";
import VirtueCheckIn from "@/models/VirtueCheckIn";
import User from "@/models/User";
import { currentVirtueOrder } from "@/lib/seed-virtues";
import { resolveSelectedPhilosophyId } from "@/lib/philosophy";
import { isAdmin as checkIsAdmin } from "@/lib/admin";
import ReviewView from "@/components/ReviewView";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

export default async function VirtuesPage({
  searchParams,
}: {
  searchParams?: { mode?: string; date?: string; return?: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  const today = new Date().toISOString().split("T")[0];

  await connectDB();

  const philosophyId = await resolveSelectedPhilosophyId(userId);
  const virtueCount = philosophyId
    ? await VirtueModel.countDocuments({ philosophyId, isActive: true })
    : 0;

  const [virtueDoc, checkinItem, weeklyReviewItem, todayCheckIn, userDoc] = await Promise.all([
    philosophyId
      ? VirtueModel.findOne({
          philosophyId,
          order: currentVirtueOrder(new Date(), virtueCount),
          isActive: true,
        }).lean()
      : null,
    RoutineItem.findOne({ userId, itemType: "virtue_checkin" }).lean(),
    RoutineItem.findOne({ userId, itemType: "weekly_review" }).lean(),
    VirtueCheckIn.findOne({ userId, date: today }).lean(),
    userId !== DEV_USER_ID
      ? User.findById(userId).select("virtueWalkthroughSeen").lean()
      : null,
  ]);

  const currentVirtue = virtueDoc
    ? {
        name: virtueDoc.name,
        displayName: virtueDoc.displayName,
        tagline: virtueDoc.tagline,
        order: virtueDoc.order,
        slug: virtueDoc.slug,
      }
    : null;

  const virtueWalkthroughSeen =
    (userDoc as { virtueWalkthroughSeen?: boolean } | null)?.virtueWalkthroughSeen ?? false;

  const mode =
    searchParams?.mode === "checkin" || searchParams?.mode === "weekly"
      ? searchParams.mode
      : null;

  return (
    <ReviewView
      userName={session?.user?.name ?? "Developer"}
      today={today}
      skipAuth={skipAuth ?? false}
      currentVirtue={currentVirtue}
      virtueCount={virtueCount}
      currentPhilosophyId={philosophyId}
      checkinItemId={checkinItem ? checkinItem._id.toString() : null}
      weeklyReviewItemId={weeklyReviewItem ? weeklyReviewItem._id.toString() : null}
      initialMode={mode}
      initialDate={searchParams?.date ?? null}
      returnTo={searchParams?.return ?? null}
      hasCheckedInToday={!!todayCheckIn}
      virtueWalkthroughSeen={virtueWalkthroughSeen}
      needsPhilosophy={!philosophyId}
      isAdmin={checkIsAdmin(session?.user?.email) || skipAuth}
    />
  );
}
