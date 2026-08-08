"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Wallet, LogIn, LogOut } from "lucide-react";
import { cn } from "./ui/cn";

const links = [
  { href: "/dashboard", label: "Dashboard & Empfehlungen", icon: LayoutDashboard },
  { href: "/listings", label: "Listings & Costs", icon: ListChecks },
  { href: "/settings/rate-cards", label: "Rate Cards", icon: Wallet },
];

/**
 * Client component so we can highlight the active nav item via usePathname().
 * Split out from layout.tsx (a server component) rather than converting the
 * whole layout to "use client", keeping the dev-login banner + <html>/<body>
 * shell server-rendered.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink-900">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-gold text-[11px] font-bold text-ink-900 shadow-card"
              aria-hidden
            >
              R
            </span>
            The R — Profit
          </Link>
          <div className="hidden items-center gap-1 sm:flex">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname?.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                    active ? "bg-brand-yellow/15 text-[#8a6d1f]" : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/auth/signin"
            className="flex items-center gap-1.5 text-ink-500 transition-colors hover:text-ink-900"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </a>
          <a
            href="/api/auth/signout"
            className="flex items-center gap-1.5 text-ink-500 transition-colors hover:text-ink-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </a>
        </div>
      </div>
    </nav>
  );
}
