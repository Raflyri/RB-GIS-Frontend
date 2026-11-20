import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ldkh: {
          surface: "#F8FAFC",
          panel: "#FFFFFF",
          accent: "#2563EB",
          clear: "#22C55E",
          "clear-dark": "#16A34A",
          dispute: "#EAB308",
          "dispute-dark": "#CA8A04",
          seized: "#EF4444",
          "seized-dark": "#DC2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
