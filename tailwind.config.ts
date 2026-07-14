import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#0B3D2E",
          50: "#E6EDEA",
          100: "#CCDCD5",
          200: "#99B9AB",
          300: "#669681",
          400: "#337357",
          500: "#0B3D2E",
          600: "#093226",
          700: "#07271E",
          800: "#051C16",
          900: "#03110E",
          950: "#020B09",
        },
        teal: {
          deep: "#0A4A3F",
        },
        cream: {
          DEFAULT: "#FAF6EF",
          50: "#FFFFFF",
          100: "#FDFCFA",
          200: "#FAF6EF",
          300: "#F2E9D8",
          400: "#E8DCC8",
        },
        sand: {
          DEFAULT: "#E8DCC8",
        },
        gold: {
          DEFAULT: "#D4A017",
          50: "#FBF3DD",
          100: "#F7E7BB",
          200: "#EFCF77",
          300: "#E7B733",
          400: "#D4A017",
          500: "#A87E12",
          600: "#7C5C0D",
          700: "#503B09",
        },
        terracotta: {
          DEFAULT: "#C4664A",
          50: "#F9EBE6",
          100: "#F0CFC3",
          200: "#E2A491",
          300: "#D3795F",
          400: "#C4664A",
          500: "#9E4F38",
          600: "#79392A",
        },
        ink: {
          DEFAULT: "#141414",
          muted: "#4A4640",
          soft: "#6E6A63",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "12px",
        lg: "18px",
        xl: "24px",
        "2xl": "32px",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(20, 20, 20, 0.06)",
        card: "0 4px 20px rgba(11, 61, 46, 0.08)",
        lifted: "0 12px 40px rgba(11, 61, 46, 0.14)",
        gold: "0 4px 24px rgba(212, 160, 23, 0.25)",
      },
      backgroundImage: {
        "forest-gradient": "linear-gradient(135deg, #0B3D2E 0%, #0A4A3F 100%)",
        "gold-shine":
          "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)",
      },
      keyframes: {
        "shine-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "frost-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "coin-drop": {
          "0%": { transform: "translateY(-24px) scale(0.6)", opacity: "0" },
          "60%": { transform: "translateY(4px) scale(1.05)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "shine-sweep": "shine-sweep 1.8s ease-in-out infinite",
        "frost-pulse": "frost-pulse 2.4s ease-in-out infinite",
        "coin-drop": "coin-drop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
