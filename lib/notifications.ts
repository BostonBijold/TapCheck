import { connectDB } from "@/lib/mongoose";
import PushToken from "@/models/PushToken";
import User from "@/models/User";
import { sendAlertPush, ApnsPushError } from "@/lib/apns";

// Fans a missed-shift-list digest out to every registered PushToken
// belonging to a manager at the given company — see
// docs/features/notifications.md's "Push payload" and "Failure handling".
// Callers (the cron sweep) are responsible for the write-then-send
// ordering: write the MissedListAlert dedup row BEFORE calling this, not
// after, so a crash mid-send can't cause a duplicate alert on retry.
export async function sendMissedListAlert(params: {
  companyId: string;
  taskListId: string;
  taskListName: string;
  outstandingCount: number;
  windowEndLabel: string; // e.g. "10:30pm" — already formatted, this module doesn't know time-of-day formatting
  date: string; // YYYY-MM-DD
}): Promise<void> {
  const { companyId, taskListId, taskListName, outstandingCount, windowEndLabel, date } = params;

  await connectDB();

  const managerIds = await User.find({ companyId, role: "manager" }, "_id").lean<{ _id: { toString(): string } }[]>();
  if (managerIds.length === 0) return;

  const tokens = await PushToken.find({
    companyId,
    userId: { $in: managerIds.map((m) => m._id.toString()) },
  }).lean<{ _id: { toString(): string }; token: string; environment: "sandbox" | "production" }[]>();
  if (tokens.length === 0) return;

  const title = taskListName;
  const body = `${outstandingCount} task${outstandingCount === 1 ? "" : "s"} not finished — window closed at ${windowEndLabel}`;

  await Promise.all(
    tokens.map(async (t) => {
      try {
        await sendAlertPush({
          pushToken: t.token,
          environment: t.environment,
          title,
          body,
          data: { taskListId, date },
        });
      } catch (err) {
        // A dead token (uninstalled app, reissued token) should stop being
        // retried rather than accumulate as permanent dead weight — see
        // docs/features/notifications.md's "Failure handling". Any other
        // failure (network blip, APNs outage) is left alone: this run's
        // send simply doesn't go out, and the dedup row already written by
        // the caller means there's no retry this run — accepted tradeoff,
        // a missed push is lower-stakes than a missed task.
        if (err instanceof ApnsPushError && (err.reason === "BadDeviceToken" || err.reason === "Unregistered")) {
          await PushToken.deleteOne({ _id: t._id });
        }
      }
    })
  );
}
