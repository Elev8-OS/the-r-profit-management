/**
 * Shared input/select/textarea className — every add-cost/add-listing form
 * across the app used to hand-roll this string with slight drift
 * (`border-[#e5e7eb]` vs `border-gray-200`, inconsistent focus states).
 */
export const inputClass =
  "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-brand-active focus:outline-none";
