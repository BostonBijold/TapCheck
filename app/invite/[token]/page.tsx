import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/session";
import { connectDB } from "@/lib/mongoose";
import Invite from "@/models/Invite";
import User from "@/models/User";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-mobile text-center">{children}</div>
    </main>
  );
}

// Public, unauthenticated deep link — same pattern as app/nfc/[tagCode]/
// page.tsx: not in middleware.ts's PUBLIC_PAGE_PATHS, so a logged-out tap
// redirects through /login?callbackUrl=/invite/<token> and lands back here
// afterward. companyId/role are never client-supplied — always resolved
// from the Invite document itself. See docs/features/team-invites.md.
export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) {
    redirect(`/login?callbackUrl=/invite/${token}`);
  }
  const { userId, companyId } = sessionUser;

  await connectDB();

  const invite = await Invite.findOne({ token }).lean();

  // Not found, revoked, expired, or already maxed out — don't distinguish
  // *why* in the UI, no useful info for the recipient and it avoids
  // leaking this invite's internal state to whoever holds the link.
  const isInvalid =
    !invite ||
    !!invite.revokedAt ||
    invite.expiresAt.getTime() <= Date.now() ||
    invite.useCount >= invite.maxUses;

  if (isInvalid) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Invite not valid</h1>
        <p className="text-muted font-body text-sm">This invite is no longer valid.</p>
      </Shell>
    );
  }

  // Already part of a *different* company — never silently reassign someone.
  if (companyId && companyId !== invite.companyId) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Already on a team</h1>
        <p className="text-muted font-body text-sm">
          You&apos;re already part of a team — contact support to switch companies.
        </p>
      </Shell>
    );
  }

  // Already redeemed this exact invite (double-tap, refresh) — idempotent,
  // no double-increment.
  if (companyId && companyId === invite.companyId) {
    redirect("/tasks");
  }

  // Atomic increment-with-filter — the same guard rail that keeps a
  // single-active-timer TaskLog write consistent, applied here to invite
  // consumption instead, so a maxUses:1 link can't be redeemed twice by two
  // people opening it at the same moment.
  const redeemed = await Invite.findOneAndUpdate(
    {
      token,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ["$useCount", "$maxUses"] },
    },
    { $inc: { useCount: 1 } }
  ).lean();

  if (!redeemed) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl text-text mb-2">Invite not valid</h1>
        <p className="text-muted font-body text-sm">This invite is no longer valid.</p>
      </Shell>
    );
  }

  await User.findByIdAndUpdate(userId, {
    $set: {
      companyId: redeemed.companyId,
      role: redeemed.role,
      companyJoinedAt: new Date(),
      // Stamped from the invite, never picked by whoever redeems it — see
      // docs/features/locations.md's "Location assignment". Null only for
      // an invite created before Locations shipped.
      locationId: redeemed.locationId ?? null,
    },
  });

  redirect("/welcome");
}
