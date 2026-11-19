/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "on-primary": "var(--on-primary)",
        soft: "var(--soft)",
        "on-soft": "var(--on-soft)",
        threat: "var(--threat)",
        "on-threat": "var(--on-threat)",
        stone: "var(--stone)",
        glossy: "var(--glossy)",
        "on-glossy": "var(--on-glossy)",
        focus: "var(--focus)",
      },
      fontFamily: {
        sans: ["Geist Variable", "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono Variable", "Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      backgroundImage: {
        hero: "var(--hero-gradient)",
        detection: "var(--detection-gradient)",
      },
    },
  },
  plugins: [],
}
