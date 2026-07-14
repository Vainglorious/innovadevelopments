/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e3a5f",
          light: "#2d5480",
          dark: "#152a45",
        },
      },
    },
  },
  plugins: [],
};
