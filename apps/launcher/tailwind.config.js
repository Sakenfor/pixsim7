/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Shared UI components are consumed as source (@pixsim7/shared.ui → src/index.ts),
    // so Tailwind must scan them or their classes (dark: variants, [&>option]:…) never emit.
    '../../packages/shared/ui/src/**/*.{ts,tsx}',
  ],
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
