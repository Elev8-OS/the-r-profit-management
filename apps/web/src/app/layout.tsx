import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The R — Profit Management",
  description: "Revenue & profit management for The R's short-term rental portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
