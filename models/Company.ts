import { Schema, Document, model, models } from "mongoose";

// Stubbed for v1 — no billing is wired up yet (no Stripe calls, no checkout,
// no webhook handlers), but every tenant will need this once we start
// charging, so the shape exists ahead of that work. Every company defaults
// to "trialing" / "free" on creation; nothing currently moves a company out
// of that default.
export interface ICompanySubscription {
  status: "trialing" | "active" | "past_due" | "canceled" | "none";
  tier: "free" | "starter" | "pro";
  stripeCustomerId: string | null; // "cus_..." — set once they exist in Stripe, even pre-payment
  stripeSubscriptionId: string | null; // "sub_..." — set once they actually subscribe
  trialEndsAt: Date | null;
  seatLimit: number | null; // for later per-seat pricing
  currentPeriodEnd: Date | null; // avoids hitting the Stripe API just to show "renews on X"
}

// Top-level tenant record. Deliberately generic — a restaurant, gym, hotel,
// or any other location-based service business is just a Company with its
// own users, shift groups, tasks, and check history. Nothing here (or in
// code that touches it) should be restaurant-specific.
export interface ICompany extends Document {
  companyName: string;
  // Stubbed for v1 — no UI or logic reads these yet, but every tenant will
  // eventually need them, so the fields exist ahead of that work.
  industry: string | null;
  timezone: string | null;
  notificationPreferences: Record<string, unknown>;
  // Which chirp plays on a device that just completed a task via the NFC
  // scan-to-complete binding's "Scan NFC to Save" step (see
  // docs/features/nfc.md) — a real, company-wide preference, not part of
  // the still-unused notificationPreferences bag above.
  notificationSound: "standard" | "male";
  subscription: ICompanySubscription;
}

const CompanySubscriptionSchema = new Schema<ICompanySubscription>(
  {
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled", "none"],
      default: "trialing",
    },
    tier: { type: String, enum: ["free", "starter", "pro"], default: "free" },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    trialEndsAt: { type: Date, default: null },
    seatLimit: { type: Number, default: null },
    currentPeriodEnd: { type: Date, default: null },
  },
  { _id: false }
);

const CompanySchema = new Schema<ICompany>(
  {
    companyName: { type: String, required: true },
    industry: { type: String, default: null },
    timezone: { type: String, default: null },
    notificationPreferences: { type: Schema.Types.Mixed, default: {} },
    notificationSound: { type: String, enum: ["standard", "male"], default: "standard" },
    subscription: { type: CompanySubscriptionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default models.Company || model<ICompany>("Company", CompanySchema);
