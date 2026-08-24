import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import RoutineReviewFlow from "@/components/RoutineReviewFlow";
import type { ReviewEntryPoint } from "@/models/RoutineLog";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

export default async function RoutineReviewPage({
  searchParams,
}: {
  searchParams?: { groupId?: string; date?: string; entryPoint?: string; return?: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  await connectDB();

  const reviewItem = await RoutineItem.findOne({ userId, itemType: "routine_review" }).lean();

  const groupId = searchParams?.groupId ?? null;
  let groupOptions: Array<{ _id: string; name: string; itemCount: number }> = [];

  // Only needed for the Step 0 group picker — the analytics entry point
  // already supplies a groupId and skips this entirely.
  if (!groupId) {
    const groups = await RoutineGroup.find({ userId }).sort({ order: 1 }).lean();
    const counts = await Promise.all(
      groups.map((g) =>
        RoutineItem.countDocuments({
          groupId: g._id,
          userId,
          isActive: true,
          itemType: { $nin: ["checkbox", "virtue_checkin", "weekly_review", "routine_review"] },
        })
      )
    );
    groupOptions = groups
      .map((g, i) => ({ _id: g._id.toString(), name: g.name, itemCount: counts[i] }))
      .filter((g) => g.itemCount > 0);
  }

  const entryPoint: ReviewEntryPoint =
    searchParams?.entryPoint === "analytics_button" || searchParams?.entryPoint === "notification"
      ? searchParams.entryPoint
      : "sunday_prompt";

  return (
    <RoutineReviewFlow
      date={searchParams?.date ?? new Date().toISOString().split("T")[0]}
      initialGroupId={groupId}
      groupOptions={groupOptions}
      entryPoint={entryPoint}
      returnTo={searchParams?.return ?? null}
      reviewItemId={reviewItem ? reviewItem._id.toString() : null}
    />
  );
}
