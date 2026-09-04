import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveSessionUser, isOwner } from "@/lib/session";
import NoCompanyMessage from "@/components/NoCompanyMessage";
import ConsoleShell from "@/components/console/ConsoleShell";

export const dynamic = "force-dynamic";

// Owner-only gate for the whole /console section — see
// docs/features/admin-console.md's "Auth gate". A manager/employee never
// sees this section exist; no "upgrade your role" messaging, just a plain
// redirect back to Tasks, matching the app's existing pattern of not
// exposing UI a role can't use (e.g. NoCompanyMessage.tsx below). This is a
// layout-level check, not a middleware.ts matcher — matches that same
// precedent of resolving role/company state inside a server component
// rather than at the edge.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");

  const userName = session?.user?.name ?? "Developer";

  if (!sessionUser.companyId) {
    return <NoCompanyMessage userName={userName} />;
  }
  if (!isOwner(sessionUser.role)) redirect("/tasks");

  return <ConsoleShell userName={userName}>{children}</ConsoleShell>;
}
