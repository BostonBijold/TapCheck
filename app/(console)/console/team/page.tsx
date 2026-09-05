import { redirect } from "next/navigation";
import { resolveSessionUser, isOwner } from "@/lib/session";
import TeamConsoleView from "@/components/console/TeamConsoleView";

export const dynamic = "force-dynamic";

// Phase 1b — see docs/features/admin-console.md. The console's own layout
// gate loosened to manager-or-above once Task Management shipped (see
// docs/features/console-task-management.md), so this page now checks for
// itself, same resolveSessionUser() call it already made to get
// currentUserId for the "(you)" label — the duplicate-read tradeoff the
// spec's Open Question #5 flags as a non-concern.
export default async function ConsoleTeamPage() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser || !isOwner(sessionUser.role)) redirect("/console/tasks");
  return <TeamConsoleView currentUserId={sessionUser.userId} />;
}
