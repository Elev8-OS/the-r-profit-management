import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "The R — Profit Management",
  description: "Revenue & profit management for The R's short-term rental portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#f7f7f8] font-sans text-[#14181f]">
        {process.env.ENABLE_DEV_LOGIN === "true" && (
          <div className="bg-amber-400 px-6 py-1.5 text-center text-xs font-medium text-amber-950">
            DEV LOGIN BYPASS IS ON — anyone can sign in as anyone, no Microsoft account needed.
            Unset ENABLE_DEV_LOGIN on the web-app Railway service before this is used by anyone
            else.
          </div>
        )}
        <nav className="border-b border-[#e5e7eb] bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="inline-block h-2 w-2 rounded-full bg-brand-active" aria-hidden />
                The R — Profit
              </Link>
              <Link href="/dashboard" className="text-[#6b7280] transition-colors hover:text-[#14181f]">
                Dashboard & Empfehlungen
              </Link>
              <Link href="/listings" className="text-[#6b7280] transition-colors hover:text-[#14181f]">
                Listings & Costs
              </Link>
              <Link href="/settings/rate-cards" className="text-[#6b7280] transition-colors hover:text-[#14181f]">
                Rate Cards
              </Link>
            </div>
            <div className="flex gap-4">
              <a href="/api/auth/signin" className="text-[#6b7280] transition-colors hover:text-[#14181f]">
                Sign in
              </a>
              <a href="/api/auth/signout" className="text-[#6b7280] transition-colors hover:text-[#14181f]">
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
