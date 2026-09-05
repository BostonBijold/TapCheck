import { resolveSessionUser, isOwner, pickActiveLocationId } from "@/lib/session";
import ConsoleInventoryManagementView from "@/components/console/ConsoleInventoryManagementView";

export const dynamic = "force-dynamic";

// Manager-or-above (see docs/features/console-inventory.md) — rides on
// the blanket manager-or-above gate console-task-management.md
// established, no further owner-only check needed here (unlike
// locations/team/rollup). Resolves activeLocationId server-side via
// pickActiveLocationId, same convention as /console/reports, so the
// location switcher gets an already-resolved value.
export default async function ConsoleInventoryPage() {
  const sessionUser = await resolveSessionUser();
  return (
    <ConsoleInventoryManagementView
      isOwner={!!sessionUser && isOwner(sessionUser.role)}
      activeLocationId={sessionUser ? pickActiveLocationId(sessionUser, null) : null}
    />
  );
}
