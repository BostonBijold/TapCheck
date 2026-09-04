"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Building2, Users, BarChart3, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/console/locations", label: "Locations", icon: Building2 },
  { href: "/console/team", label: "Team & Access", icon: Users },
  { href: "/console/rollup", label: "Rollup Dashboard", icon: BarChart3 },
] as const;

// Desktop sidebar shell for the Admin Console — see
// docs/features/admin-console.md's "Nav & shell". Distinct from
// components/BottomNav.tsx's mobile bottom-nav chrome; this section is
// desktop-first and never shares layout with the Capacitor app's pages.
export default function ConsoleSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 border-r border-border bg-card flex flex-col h-dvh sticky top-0">
      <div className="px-5 py-6">
        <p className="font-heading text-lg text-text">Ch&apos;rps</p>
        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mt-0.5">Admin Console</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-card font-body text-sm transition-colors ${
                active ? "bg-olive/10 text-olive" : "text-muted hover:bg-card-hover hover:text-text"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <p className="px-3 font-body text-xs text-dim truncate mb-2">{userName}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-card font-body text-sm text-muted hover:bg-card-hover hover:text-burgundy-light transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
