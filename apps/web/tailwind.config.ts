import type { Config } from "tailwindcss";

// Elev8 Suite brand tokens (see the elev8-product-knowledge brand reference):
// primary yellow #F6BB12 / active #EFB100 for UI accents & active states,
// design-token gold #C8A84B for connected/active indicators, Inter font,
// clean white backgrounds with light borders, rounded-lg/md corners.
//
// This file is the design-system foundation for the app-wide "wow factor"
// redesign (2026-08-08): it stays inside Elev8's existing light/gold
// identity (no dark mode, no new palette) but adds the extra tokens
// (surface elevation, semantic colors, shadows, motion) needed for shared
// Card/Badge/StatTile/Button components to look considered rather than
// bare inline-Tailwind.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#F6BB12",
          active: "#EFB100",
          gold: "#C8A84B",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f7f7f8",
          raised: "#ffffff",
          gold: "#fffdf7",
        },
        ink: {
          900: "#14181f",
          700: "#374151",
          500: "#6b7280",
          300: "#9ca3af",
        },
        line: {
          DEFAULT: "#e5e7eb",
          strong: "#d1d5db",
          gold: "#f0dfa8",
        },
        success: {
          DEFAULT: "#16a34a",
          bg: "#f0fdf4",
          border: "#bbf7d0",
          text: "#15803d",
        },
        warning: {
          DEFAULT: "#d97706",
          bg: "#fffbeb",
          border: "#fde68a",
          text: "#92400e",
        },
        danger: {
          DEFAULT: "#dc2626",
          bg: "#fef2f2",
          border: "#fecaca",
          text: "#b91c1c",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(20 24 31 / 0.04), 0 1px 3px 0 rgb(20 24 31 / 0.06)",
        "card-hover": "0 4px 10px -2px rgb(20 24 31 / 0.08), 0 8px 24px -4px rgb(20 24 31 / 0.10)",
        "glow-gold": "0 0 0 1px rgb(246 187 18 / 0.25), 0 6px 20px -4px rgb(246 187 18 / 0.35)",
        "inset-line": "inset 0 0 0 1px rgb(20 24 31 / 0.06)",
      },
      backgroundImage: {
        "gradient-gold": "linear-gradient(135deg, #F6BB12 0%, #EFB100 100%)",
        "gradient-gold-soft": "linear-gradient(135deg, rgba(246,187,18,0.14) 0%, rgba(200,168,75,0.06) 100%)",
        "gradient-radial-glow":
          "radial-gradient(60% 60% at 50% 0%, rgba(246,187,18,0.16) 0%, rgba(246,187,18,0) 70%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(246,187,18,0.35)" },
          "50%": { boxShadow: "0 0 0 6px rgba(246,187,18,0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.35s ease-out both",
        "scale-in": "scale-in 0.2s ease-out both",
        shimmer: "shimmer 2s linear infinite",
        "pulse-glow": "pulse-glow 2.2s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
