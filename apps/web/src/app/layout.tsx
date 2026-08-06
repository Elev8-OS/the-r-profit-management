import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The R — Profit Management",
  description: "Revenue & profit management for The R's short-term rental portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {process.env.ENABLE_DEV_LOGIN === "true" && (
          <div className="bg-amber-400 px-6 py-1.5 text-center text-xs font-medium text-amber-950">
            DEV LOGIN BYPASS IS ON — anyone can sign in as anyone, no Microsoft account needed.
            Unset ENABLE_DEV_LOGIN on the web-app Railway service before this is used by anyone
            else.
          </div>
        )}
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
            <div className="flex gap-5">
              <Link href="/" className="font-medium">
                The R — Profit
              </Link>
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                Dashboard
              </Link>
              <Link href="/listings" className="text-slate-600 hover:text-slate-900">
                Listings & Costs
              </Link>
              <Link href="/settings/rate-cards" className="text-slate-600 hover:text-slate-900">
                Rate Cards
              </Link>
            </div>
            <div className="flex gap-4">
              <a href="/api/auth/signin" className="text-slate-600 hover:text-slate-900">
                Sign in
              </a>
              <a href="/api/auth/signout" className="text-slate-600 hover:text-slate-900">
                Sign out
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
