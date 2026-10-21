/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        space: {
          950: "#050811",
          900: "#0b0f19",
          850: "#0e1422",
          800: "#121827",
          750: "#182033",
          700: "#1e293b",
          600: "#334155",
        },
        cyan: {
          300: "#a6ecd3",
          400: "#8be0c1",
          500: "#68caaa",
          600: "#43a987",
          700: "#287a5e",
          800: "#14503e",
          900: "#0d342a",
          950: "#08251d",
          glow: "#8be0c1",
          dim: "rgba(139, 224, 193, 0.12)",
        },
      },
      fontFamily: {
        display: ["Manrope", "DM Sans", "system-ui", "sans-serif"],
        sans: ["Manrope", "DM Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan-line": "scanLine 3s linear infinite",
        "grid-float": "gridFloat 20s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": {
            opacity: 1,
            boxShadow: "0 0 15px rgba(0, 240, 255, 0.4)",
          },
          "50%": { opacity: 0.6, boxShadow: "0 0 5px rgba(0, 240, 255, 0.1)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        gridFloat: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "50px 50px" },
        },
      },
    },
  },
  plugins: [],
};
