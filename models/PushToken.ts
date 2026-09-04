import { Schema, Document, model, models } from "mongoose";

// A persistent, standing device token for ordinary remote notifications
// (missed-shift-list alerts — see docs/features/notifications.md),
// registered once per install via @capacitor/push-notifications and
// refreshed whenever iOS reissues one. Distinct from
// User.liveActivityPushToken — that one is ephemeral and tied to a single
// running timer's Live Activity; this one is a standing per-device
// registration with no timer attached.
//
// One row per device, not per user — a manager with a phone and a
// back-office iPad both get notified, each via their own row.
export interface IPushToken extends Document {
  userId: string;
  companyId: string;
  token: string;
  environment: "sandbox" | "production";
  platform: "ios";
  lastSeenAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    userId: { type: String, required: true },
    companyId: { type: String, required: true, index: true },
    token: { type: String, required: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    platform: { type: String, enum: ["ios"], default: "ios" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A reinstalled app re-registers the same physical device under a fresh
// token — the old row is simply orphaned and pruned lazily on a
// BadDeviceToken/Unregistered APNs response (see lib/notifications.ts),
// not proactively deduped here.
PushTokenSchema.index({ token: 1 }, { unique: true });

export default models.PushToken || model<IPushToken>("PushToken", PushTokenSchema);
