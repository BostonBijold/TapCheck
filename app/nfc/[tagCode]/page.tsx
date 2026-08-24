import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { triggerHabit } from "@/lib/nfc-actions";
import NfcTag from "@/models/NfcTag";
import PendingNfcLink from "@/models/PendingNfcLink";
import RoutineItem from "@/models/RoutineItem";
import ClaimTagPicker from "@/components/ClaimTagPicker";
import DoneScreen from "@/components/DoneScreen";

const DEV_USER_ID = "dev-local-user";
const PENDING_LINK_MAX_AGE_MS = 5 * 60 * 1000;

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-mobile text-center">{children}</div>
    </main>
  );
}

export default async function NfcTagPage({
  params,
}: {
  params: { tagCode: string };
}) {
  const { tagCode } = params;
  const session = await auth();
  const userId = session?.user?.id || (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);

  if (!userId) {
    redirect(`/login?callbackUrl=/nfc/${tagCode}`);
  }

  await connectDB();

  const tag = await NfcTag.findOne({ tagCode });

  if (!tag) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Invalid tag</h1>
        <p className="text-muted font-body text-sm">This NFC tag isn&apos;t recognized.</p>
      </Shell>
    );
  }

  // Already claimed by someone else — don't reveal which item/user.
  if (tag.userId && tag.userId !== userId) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Already linked</h1>
        <p className="text-muted font-body text-sm">
          This tag is already linked to another account.
        </p>
      </Shell>
    );
  }

  // Unclaimed — either auto-claim against an armed pending link, or show a
  // picker if the tag was tapped cold with nothing armed.
  if (!tag.userId) {
    const pending = await PendingNfcLink.findOne({ userId });
    const isFresh = pending && Date.now() - pending.armedAt.getTime() < PENDING_LINK_MAX_AGE_MS;

    if (pending && isFresh) {
      const item = await RoutineItem.findOne({ _id: pending.routineItemId, userId, isActive: true }).lean();
      if (item) {
        tag.userId = userId;
        tag.routineItemId = item._id;
        tag.routineGroupId = item.groupId;
        tag.claimedAt = new Date();
        await tag.save();
        await PendingNfcLink.deleteOne({ userId });

        return (
          <Shell>
            <h1 className="font-heading text-2xl text-text mb-2">Linked</h1>
            <p className="text-muted font-body text-sm mb-6">
              This tag now starts <span className="text-text">{item.name}</span>.
            </p>
            <a
              href="/routines"
              className="inline-block bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
            >
              Back to Routines
            </a>
          </Shell>
        );
      }
    }

    const items = await RoutineItem.find({ userId, isActive: true }).sort({ order: 1 }).lean();
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Link this tag</h1>
        <p className="text-muted font-body text-sm mb-6">
          Which habit should this tag start?
        </p>
        <ClaimTagPicker
          tagCode={tagCode}
          items={items.map((i) => ({ _id: i._id.toString(), name: i.name, icon: i.icon }))}
        />
      </Shell>
    );
  }

  // Claimed by this user — the everyday trigger case.
  const item = await RoutineItem.findOne({ _id: tag.routineItemId, userId, isActive: true }).lean();
  if (!item) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Habit not found</h1>
        <p className="text-muted font-body text-sm">
          The habit this tag was linked to no longer exists.
        </p>
      </Shell>
    );
  }

  const routineGroupId = tag.routineGroupId ? tag.routineGroupId.toString() : null;
  const { completed, started } = await triggerHabit(
    userId,
    item._id.toString(),
    item.itemType,
    routineGroupId,
    todayString()
  );

  // The tapped item itself just landed in a terminal `done` state — either
  // it's a mark-and-done type (checkbox/virtue_checkin/weekly_review, which
  // go straight to done via startImmediateLog, never in_progress at all) or
  // it was the already-running timer this exact tap just completed. Either
  // way, show the same static confirmation TimerScreen.tsx's own "Done"
  // button leads to — no timer here, just "yes, that's logged."
  //
  // A timer that just *started* (or a different item that got completed as
  // this tap's Case 3 side effect) isn't this tapped item being done, so
  // that falls through to the plain redirect instead.
  const tappedItemId = item._id.toString();
  const tappedJustCompleted =
    (started?.routineItemId === tappedItemId && started?.state === "done") ||
    (completed?.routineItemId === tappedItemId && completed?.state === "done");

  if (tappedJustCompleted) {
    return <DoneScreen name={item.name} icon={item.icon} inRoutine={!!routineGroupId} />;
  }

  redirect("/routines");
}
