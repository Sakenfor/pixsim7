/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0d1117',
          secondary: '#161b22',
          tertiary: '#1c2128',
          hover: '#1f2937',
        },
        border: {
          DEFAULT: '#30363d',
          focus: '#58a6ff',
        },
      },
    },
  },
  plugins: [],
}
