import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AlertTriangle } from "lucide-react";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "The R — Profit Management",
  description: "Revenue & profit management for The R's short-term rental portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-sunken font-sans text-ink-900">
        {process.env.ENABLE_DEV_LOGIN === "true" && (
          <div className="flex items-center justify-center gap-1.5 bg-warning px-6 py-1.5 text-center text-xs font-medium text-white">
            <AlertTriangle className="h-3.5 w-3.5" />
            DEV LOGIN BYPASS IS ON — anyone can sign in as anyone, no Microsoft account needed.
            Unset ENABLE_DEV_LOGIN on the web-app Railway service before this is used by anyone
            else.
          </div>
        )}
        <Nav />
        {children}
      </body>
    </html>
  );
}
