import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Philosophy from "@/models/Philosophy";
import { weekStartDate } from "@/lib/virtue-dates";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

// PATCH /api/user/profile — accepts any subset of:
//   virtueWalkthroughSeen: boolean
//   selectedPhilosophyId: string | null  — this is what the marketplace's
//     "tap to select" action calls. null explicitly clears the selection
//     (drops the user back into the marketplace). A non-null value must
//     reference a real, active Philosophy — validated here rather than
//     trusted from the client. Setting it to a non-null value always also
//     resets the caller's personal virtue-stacking progress (see
//     virtueStackStartWeek below) — switching philosophies never carries
//     stacked progress over, since the brief treats every philosophy
//     selection (first pick or a later switch) as the start of a fresh
//     stacking epoch. This is an invariant of the route, not a
//     client-toggleable option — the client only decides whether to show a
//     confirmation dialog first (see PhilosophyManageSheet.tsx).
//   resetVirtueStack: true — the standalone "Virtue Reset" action; resets
//     virtueStackStartWeek to the current week without touching the
//     selected philosophy.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId =
    session?.user?.id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const update: Record<string, unknown> = {};

  if ("virtueWalkthroughSeen" in body) {
    if (typeof body.virtueWalkthroughSeen !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    update.virtueWalkthroughSeen = body.virtueWalkthroughSeen;
  }

  await connectDB();

  if ("selectedPhilosophyId" in body) {
    if (body.selectedPhilosophyId === null) {
      update.selectedPhilosophyId = null;
    } else if (typeof body.selectedPhilosophyId === "string") {
      const philosophy = await Philosophy.findOne({
        _id: body.selectedPhilosophyId,
        isActive: true,
      }).lean();
      if (!philosophy) {
        return NextResponse.json({ error: "Invalid philosophy" }, { status: 400 });
      }
      update.selectedPhilosophyId = body.selectedPhilosophyId;
      update.virtueStackStartWeek = weekStartDate(new Date());
    } else {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  if ("resetVirtueStack" in body) {
    if (body.resetVirtueStack !== true) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    update.virtueStackStartWeek = weekStartDate(new Date());
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // dev-local-user's id isn't a valid ObjectId, so a Mongoose
  // findByIdAndUpdate throws a CastError before the upsert ever runs — go
  // through the raw driver collection instead, which isn't schema-cast.
  if (mongoose.isValidObjectId(userId)) {
    await User.findByIdAndUpdate(userId, { $set: update }, { upsert: true });
  } else {
    await User.collection.updateOne(
      { _id: userId } as unknown as { _id: mongoose.Types.ObjectId },
      { $set: update },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true });
}
