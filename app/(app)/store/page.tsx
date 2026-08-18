import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function StorePage() {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4">
        <header className="pt-8 pb-6">
          <h1 className="font-heading text-2xl text-text">Store</h1>
          <p className="font-mono text-muted text-xs mt-1">Gear for the work</p>
        </header>

        <div className="bg-card rounded-card px-6 py-10 text-center">
          <p className="font-heading text-xl text-text mb-2">Coming Soon</p>
          <p className="font-mono text-dim text-xs">Products for the man building himself</p>
        </div>
      </div>
    </div>
  );
}
