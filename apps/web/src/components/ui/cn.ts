import { clsx, type ClassValue } from "clsx";

/**
 * Tiny className-joining helper. We don't use tailwind-merge here (one less
 * dependency) — none of this design system's className calls pass
 * conflicting Tailwind utilities for the same property, so plain clsx is
 * enough.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
