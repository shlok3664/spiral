/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        attack: "var(--attack)",
        warning: "var(--warning)",
        ok: "var(--ok)",
      },
      fontFamily: {
        sans: ["Geist Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
}
