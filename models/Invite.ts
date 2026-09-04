import { Schema, model, models } from "mongoose";

// A link-possession-based join token — see docs/features/team-invites.md.
// Whoever holds the URL can redeem it (no email-locking in this first
// pass); companyId/role are only ever resolved server-side from this
// document, never client-supplied. Redemption is atomic (see
// app/invite/[token]/page.tsx) so a maxUses:1 link can't be double-spent by
// two people opening it at the same moment.
const InviteSchema = new Schema(
  {
    companyId: { type: String, required: true, index: true },
    // crypto.randomBytes(24).toString("base64url") — unguessable, never
    // derivable from this doc's own _id.
    token: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["employee", "manager"], required: true },
    // Stamped from the creating manager's own User.locationId at POST
    // /api/invites time (an owner has no single "current" location, so they
    // pick one explicitly instead — see docs/features/locations.md). Never
    // client-supplied by whoever redeems the link. Nullable only for
    // invites created before Locations shipped; every new invite requires
    // one.
    locationId: { type: String, default: null },
    // Attribution only, same pattern as NfcTag.claimedByUserId — not an
    // access restriction on who can redeem the invite.
    createdByUserId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    maxUses: { type: Number, default: 1 },
    useCount: { type: Number, default: 0 },
    // Soft-delete for DELETE /api/invites/[id] — kept as a document (not
    // hard-removed) so a redemption already in flight against this token
    // fails cleanly against the revoked state instead of a missing doc.
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

InviteSchema.index({ companyId: 1, revokedAt: 1 });

export default models.Invite || model("Invite", InviteSchema);
