import { redirect } from "next/navigation";

// Cost entry now lives per-listing (see /listings/[id]) plus tenant-wide
// rate cards (see /settings/rate-cards). This route just redirects there.
export default function CostsPage() {
  redirect("/listings");
}
