import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        bg: "#ffffff",
        card: "#eef2f7",
        "card-hover": "#e4e9f0",
        // Text
        text: "#0f172a",
        muted: "#64748b",
        dim: "#94a3b8",
        // Accents
        olive: "#2563eb",
        "olive-light": "#3b82f6",
        gold: "#3b82f6",
        // Ch'rps Green — sampled from the logo's checkmark, reserved for
        // "this is actually complete" indicators (done badges/borders/dots)
        // so they read as distinct from "olive" (brand blue, used for
        // actions/buttons/links/streak-in-progress) now that blue also
        // covers the task-swap backdrop. See CLAUDE.md's Colors section.
        done: "#22b37c",
        tobacco: "#78716c",
        burgundy: "#dc2626",
        "burgundy-light": "#ef4444",
        amber: "#d97706",
        "blue-muted": "#71717a",
        // Borders
        border: "#dbe2ea",
        "border-light": "#c7d1dc",
      },
      fontFamily: {
        heading: ["var(--font-playfair)", "serif"],
        mono: ["var(--font-ibm-mono)", "monospace"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        // Cards: 12px, Modals: 16px top, Buttons: 8px, Pills: 20px
        card: "12px",
        modal: "16px",
        pill: "20px",
      },
      maxWidth: {
        mobile: "420px",
      },
    },
  },
  plugins: [],
};
export default config;
