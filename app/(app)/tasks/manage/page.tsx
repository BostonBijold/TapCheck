import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveSessionUser } from "@/lib/session";
import ManageTasksView from "@/components/ManageTasksView";

export const dynamic = "force-dynamic";

// Manager-only "Available Tasks" catalog — the company's full saved-task
// catalog (see docs/features/task-lists.md's "Company Task Catalog"
// section), regardless of which lists currently use them. Not part of the
// bottom nav (Tasks/Analytics + FAB is the fixed shape — see CLAUDE.md) —
// reached from the Profile page and from each list's edit page instead.
export default async function ManageTasksPage() {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  if (!sessionUser.companyId) redirect("/tasks");
  if (sessionUser.role !== "manager") redirect("/tasks");

  const today = new Date().toISOString().split("T")[0];
  const userName = session?.user?.name ?? "Developer";

  return <ManageTasksView userName={userName} today={today} skipAuth={skipAuth} />;
}
