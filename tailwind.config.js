/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tile colors. Chosen so their luminances stay distinct in grayscale;
        // every tile also carries its initial, so color is never the only cue
        // (NFR-006, AC-034).
        tile: {
          blue: '#2f6fd0',
          yellow: '#e8c33a',
          red: '#c8402f',
          green: '#2fa15c',
          white: '#e9e6dd',
        },
      },
    },
  },
  plugins: [],
};
