/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./js/**/*.js",
    "./components/**/*.js",
    "./services/**/*.js",
    "./stores/**/*.js",
    "./utils/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F1117',
          card: '#1A1D26',
          nav: '#171A22',
          text: '#F3F4F6',
          textSecondary: '#9CA3AF'
        }
      }
    }
  },
  plugins: [],
}
