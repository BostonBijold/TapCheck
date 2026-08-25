import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findUserIdByApiKey } from "@/lib/api-key";
import { triggerHabit } from "@/lib/nfc-actions";
import NfcTag from "@/models/NfcTag";
import PendingNfcLink from "@/models/PendingNfcLink";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

// Third entry point into triggerHabit() (lib/nfc-actions.ts), alongside
// POST /api/external/trigger-habit and app/nfc/[tagCode]. Built for a
// single generic iPhone Shortcut, imported once per user and paired with a
// per-physical-tag NFC Automation, so a tap fires this silently — no OS
// confirmation card, no app-open requirement, works with the phone locked.
// See docs/features/nfc.md's "Setting up silent tap triggers" and
// docs/api/external-api.md for the full picture.
//
// Unlike trigger-habit (caller supplies routineItemId directly), this
// resolves tagCode -> routineItemId server-side at tap time, mirroring
// app/nfc/[tagCode]/page.tsx's own NfcTag lookup so relinking a tag to a
// different habit in-app needs zero changes on the Shortcuts side.
const PENDING_LINK_MAX_AGE_MS = 5 * 60 * 1000;

function todayString() {
  return new Date().toISOString().split("T")[0];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
  const { tagCode } = params;

  // GET from Shortcuts' "Get Contents of URL" carries no body — apiKey only
  // ever arrives via header or query string, unlike the POST siblings.
  const apiKey = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const userId = await findUserIdByApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Not .lean() — the unclaimed-tag auto-claim branch below needs tag.save().
  const tag = await NfcTag.findOne({ tagCode });

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  // Claimed by someone else — same generic response as "not found", never
  // reveal a tag's existence/ownership. Matches app/nfc/[tagCode]/page.tsx.
  if (tag.userId && tag.userId !== userId) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  let item;

  if (!tag.userId) {
    // Unclaimed — auto-claim against a fresh PendingNfcLink exactly like the
    // Universal Link "arm, then tap" flow. No interactive picker is possible
    // over a Shortcut GET call, so a cold unclaimed tap is a dead end here.
    const pending = await PendingNfcLink.findOne({ userId });
    const isFresh = pending && Date.now() - pending.armedAt.getTime() < PENDING_LINK_MAX_AGE_MS;

    const claimedItem = isFresh
      ? await RoutineItem.findOne({ _id: pending.routineItemId, userId, isActive: true }).lean()
      : null;

    if (!claimedItem) {
      return NextResponse.json(
        { error: "Tag is not linked to a habit yet — link it in the app first" },
        { status: 422 }
      );
    }

    tag.userId = userId;
    tag.routineItemId = claimedItem._id;
    tag.routineGroupId = claimedItem.groupId;
    tag.claimedAt = new Date();
    await tag.save();
    await PendingNfcLink.deleteOne({ userId });

    item = claimedItem;
  } else {
    // Claimed by this user — the everyday trigger case.
    item = await RoutineItem.findOne({ _id: tag.routineItemId, userId, isActive: true }).lean();
    if (!item) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
  }

  // The tag's own stored routineGroupId is never caller input, so unlike
  // trigger-habit/start-timer there's nothing to re-validate it against.
  const routineGroupId = tag.routineGroupId ? tag.routineGroupId.toString() : null;
  const date = todayString();

  const { completed, started } = await triggerHabit(
    userId,
    item._id.toString(),
    item.itemType,
    routineGroupId,
    date
  );

  return NextResponse.json({ ok: true, completed, started });
}
