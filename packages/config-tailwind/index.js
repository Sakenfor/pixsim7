/**
 * Tailwind preset for PixSim7 apps
 */
let plugin
try {
  // Resolve tailwindcss/plugin from the consumer project when used cross-package
  const r = require
  const resolved = r.resolve('tailwindcss/plugin', { paths: [process.cwd(), __dirname] })
  plugin = r(resolved)
} catch (e) {
  plugin = require('tailwindcss/plugin')
}

/** @type {import('tailwindcss').Config} */
const preset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
      },
    },
  },
  plugins: [
    plugin(function ({ addBase }) {
      addBase({
        ':root': {
          '--ring': '0 0 #0000',
          '--bg': '255 255 255',
          '--fg': '33 53 71',
        },
        '.dark': {
          '--bg': '23 23 23',
          '--fg': '229 231 235',
        },
        'body': {
          backgroundColor: 'rgb(var(--bg))',
          color: 'rgb(var(--fg))',
        }
      })
    }),
  ],
}

module.exports = preset
