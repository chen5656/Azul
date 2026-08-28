/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Final palette (docs/plans/04-frontend.md); P2 uses it flat, no polish.
        tile: {
          blue: "#2f6fb3",
          yellow: "#e0b526",
          red: "#c0392b",
          black: "#2f3437",
          white: "#e8e2d6",
        },
      },
    },
  },
  plugins: [],
};
