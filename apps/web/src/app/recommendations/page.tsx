import { redirect } from "next/navigation";

/**
 * Recommendations are now shown inline per listing on /dashboard (combined
 * view, per Reto's request 2026-08-07: "Dashboard und Empfehlungen sind zu
 * kombinieren"). This route stays only so old links/bookmarks still land
 * somewhere useful. The server actions in ./actions.ts are unchanged and are
 * imported directly by the dashboard page.
 */
export default function RecommendationsPage() {
  redirect("/dashboard");
}
