import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import NfcTag from "@/models/NfcTag";
import RoutineEditView from "@/components/RoutineEditView";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

export default async function EditRoutinePage({
  params,
}: {
  params: { groupId: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  await connectDB();

  const group = await RoutineGroup.findOne({ _id: params.groupId, userId }).lean();
  if (!group) redirect("/routines");

  const items = await RoutineItem.find({
    groupId: params.groupId,
    userId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  const tags = await NfcTag.find({
    userId,
    routineItemId: { $in: items.map((i) => i._id) },
  }).lean();
  const tagByItemId = new Map(tags.map((t) => [t.routineItemId!.toString(), t.tagCode]));

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
        itemType: (i.itemType ?? "standard") as "standard" | "stopwatch" | "checkbox",
        // Existing documents predate these fields — Mongoose defaults only
        // apply on create, so a .lean() read can come back undefined.
        scheduledDays: i.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
        successThreshold: i.successThreshold ?? (i.scheduledDays?.length ?? 7),
        nfcTagCode: tagByItemId.get(i._id.toString()) ?? null,
      }))}
    />
  );
}
