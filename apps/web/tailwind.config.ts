import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14211b",
        paper: "#f3ecdc",
        moss: "#1b2820",
        lime: "#dff25a",
        coral: "#ff5d3a",
        mist: "#a7b5a8",
        line: "#2c3a31",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      boxShadow: {
        card: "0 20px 50px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
