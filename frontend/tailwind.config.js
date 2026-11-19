/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "var(--sand)",
        cream: "var(--cream)",
        ink: "var(--ink)",
        forest: "var(--forest)",
        lime: "var(--lime)",
        crimson: "var(--crimson)",
        stone: "var(--stone)",
      },
      fontFamily: {
        sans: ["Geist Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["Instrument Serif", "Georgia", "serif"],
      },
    },
    backgroundImage: {
      "forest-block": "linear-gradient(135deg, #1F4D3A 0%, #356149 100%)",
      "lime-block": "linear-gradient(135deg, #C9E265 0%, #D8EA82 100%)",
    },
  },
  plugins: [],
}
