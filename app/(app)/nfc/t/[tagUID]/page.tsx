import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import NfcTag from "@/models/NfcTag";
import RoutineItem from "@/models/RoutineItem";
import { toggleRoutineItemLog } from "@/lib/routine-log-actions";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

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

function BackToRoutines() {
  return (
    <Link
      href="/routines"
      className="inline-block mt-6 font-mono text-xs text-olive hover:text-olive-light transition-colors"
    >
      ← Back to Routines
    </Link>
  );
}

// The literal URL written to a physical NFC tag: https://<host>/nfc/t/<tagUID>.
// One tap resolves the tag, looks up its linked habit, and toggles that
// habit's timer (start/resume, or close if already running) — never a
// param the tag itself carries, only tagUID. See docs/features/nfc.md.
export default async function NfcTagPage({
  params,
}: {
  params: { tagUID: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  await connectDB();

  // Idempotent — never overwrites an existing assignment. This is the only
  // place a tag doc gets created; from here on it's edited via
  // POST /api/nfc-tags from the habit edit panel.
  const tag = await NfcTag.findOneAndUpdate(
    { userId, tagUID: params.tagUID },
    { $setOnInsert: { routineItemId: null, groupId: null, label: null } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const item = tag.routineItemId
    ? await RoutineItem.findOne({ _id: tag.routineItemId, userId, isActive: true }).lean()
    : null;

  // Linked item is missing or was soft-deleted — self-heal rather than show
  // a raw error, since there's nothing useful to toggle anymore.
  if (tag.routineItemId && !item) {
    tag.routineItemId = null;
    tag.groupId = null;
    await tag.save();
  }

  if (!item) {
    return (
      <Shell>
        <p className="font-heading text-2xl text-text mb-3">Not linked yet</p>
        <p className="font-body text-sm text-muted mb-5">
          Open the habit in Manage Routines and tap <strong>Link NFC tag</strong>, then enter
          this code:
        </p>
        <p className="font-mono text-sm text-text bg-card border border-border rounded-card px-4 py-3 break-all select-all">
          {params.tagUID}
        </p>
        <BackToRoutines />
      </Shell>
    );
  }

  const { started, alreadyDone } = await toggleRoutineItemLog(
    userId,
    item,
    todayString(),
    tag.groupId ? tag.groupId.toString() : null
  );

  if (alreadyDone) {
    return (
      <Shell>
        <p className="font-heading text-2xl text-text mb-3">Already completed today</p>
        <p className="font-body text-sm text-muted">{item.name} is already marked done.</p>
        <BackToRoutines />
      </Shell>
    );
  }

  // A start (fresh, resumed, jumped-to, or auto-advanced-to after a close)
  // reopens the right screen via the same mechanism the app's own FAB
  // active-timer indicator uses — see RoutinesView's autoResumeTimer effect.
  redirect(started ? "/routines?resumeTimer=1" : "/routines");
}
