import { resolveSessionUser } from "@/lib/session";
import TeamConsoleView from "@/components/console/TeamConsoleView";

export const dynamic = "force-dynamic";

// Phase 1b — see docs/features/admin-console.md. The owner-only gate
// already ran in app/(console)/console/layout.tsx; this second
// resolveSessionUser() call is only to get currentUserId for the "(you)"
// label, the same duplicate-read tradeoff the spec's Open Question #5
// flags as a non-concern.
export default async function ConsoleTeamPage() {
  const sessionUser = await resolveSessionUser();
  return <TeamConsoleView currentUserId={sessionUser?.userId ?? ""} />;
}
