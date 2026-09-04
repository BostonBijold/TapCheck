import { redirect } from "next/navigation";

// /console has no landing content of its own — Locations is the thinnest,
// first-built slice (see docs/features/admin-console.md's "Dependency
// ordering"), so it's the default section an owner lands on.
export default function ConsoleIndexPage() {
  redirect("/console/locations");
}
