/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Body defaults to Arimo; headings use Oswald (matches the Innova site).
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#1e3a5f", // navy — buttons (readable white text)
          light: "#2d5480",
          dark: "#152a45",
          accent: "#5b9bd5", // Innova logo blue — accents, borders, focus rings
        },
      },
    },
  },
  plugins: [],
};
