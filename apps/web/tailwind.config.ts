import type { Config } from "tailwindcss";

// Elev8 Suite brand tokens (see the elev8-product-knowledge brand reference):
// primary yellow #F6BB12 / active #EFB100 for UI accents & active states,
// design-token gold #C8A84B for connected/active indicators, Inter font,
// clean white backgrounds with light borders, rounded-lg/md corners.
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
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
