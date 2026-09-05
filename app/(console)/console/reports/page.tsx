import { resolveSessionUser, isOwner, pickActiveLocationId } from "@/lib/session";
import ConsoleReportsView from "@/components/console/reports/ConsoleReportsView";

export const dynamic = "force-dynamic";

// Manager-or-above (see docs/features/console-reports.md) — rides on the
// blanket manager-or-above gate console-task-management.md established,
// no further owner-only check needed here (unlike locations/team/rollup),
// since Reports is manager-and-up on mobile already. Resolves
// activeLocationId server-side via pickActiveLocationId, same convention
// as app/(app)/reports/page.tsx, so ConsoleReportsView's LocationSwitcher
// gets an already-resolved value rather than fetching its own.
export default async function ConsoleReportsPage() {
  const sessionUser = await resolveSessionUser();
  return (
    <ConsoleReportsView
      isOwner={!!sessionUser && isOwner(sessionUser.role)}
      activeLocationId={sessionUser ? pickActiveLocationId(sessionUser, null) : null}
    />
  );
}
