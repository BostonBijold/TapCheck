import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import type { ItemType } from "@/models/RoutineItem";
import AppIntentLink from "@/models/AppIntentLink";
import RoutineEditView from "@/components/RoutineEditView";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EditRoutinePage({
  params,
}: {
  params: { groupId: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId, userId } = sessionUser;
  if (!companyId) redirect("/routines");

  await connectDB();

  const group = await RoutineGroup.findOne({ _id: params.groupId, companyId }).lean();
  if (!group) redirect("/routines");

  const items = await RoutineItem.find({
    groupId: params.groupId,
    companyId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  // AppIntentLink stays scoped to the specific signed-in person — it
  // records whose Shortcut is connected to a habit, not company config.
  const appIntentLinks = await AppIntentLink.find({
    userId,
    routineItemId: { $in: items.map((i) => i._id) },
  }).lean();
  const appIntentByItemId = new Map(
    appIntentLinks.map((l) => [l.routineItemId.toString(), l.lastTriggeredAt.toISOString()])
  );

  return (
    <RoutineEditView
      group={{
        _id: group._id.toString(),
        name: group.name,
        startTime: group.startTime ?? null,
      }}
      items={items.map((i) => ({
        _id: i._id.toString(),
        name: i.name,
        icon: i.icon,
        projectedMinutes: i.projectedMinutes,
        order: i.order,
        itemType: (i.itemType ?? "form_check") as ItemType,
        formFields: i.formFields ?? [],
        // Existing documents predate these fields — Mongoose defaults only
        // apply on create, so a .lean() read can come back undefined.
        scheduledDays: i.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
        successThreshold: i.successThreshold ?? (i.scheduledDays?.length ?? 7),
        appIntentLastTriggeredAt: appIntentByItemId.get(i._id.toString()) ?? null,
      }))}
    />
  );
}
