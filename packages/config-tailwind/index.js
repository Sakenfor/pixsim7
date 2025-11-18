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
        // Semantic colors for theming
        success: {
          light: '#10b981',
          DEFAULT: '#059669',
          dark: '#047857',
        },
        warning: {
          light: '#f59e0b',
          DEFAULT: '#d97706',
          dark: '#b45309',
        },
        error: {
          light: '#ef4444',
          DEFAULT: '#dc2626',
          dark: '#b91c1c',
        },
        info: {
          light: '#3b82f6',
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
        },
      },
      boxShadow: {
        // Elevation system for consistent depth
        'elevation-0': 'none',
        'elevation-1': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'elevation-3': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'elevation-4': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'elevation-5': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
      zIndex: {
        // Standardized z-index scale for consistent layering
        // Use these instead of arbitrary values like z-[100]
        'base': '0',
        'dropdown': '50',         // Dropdowns, popovers
        'sticky': '100',          // Sticky headers, toolbars
        'fixed': '500',           // Fixed UI elements
        'modal-backdrop': '1000', // Modal backdrops
        'modal': '1001',          // Modal dialogs
        'popover': '1002',        // Popovers over modals
        'tooltip': '1003',        // Tooltips (highest UI layer)
        'toast': '9999',          // Toast notifications (always on top)
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
          // Semantic color variables for theming
          '--success': '16 185 129',
          '--warning': '245 158 11',
          '--error': '239 68 68',
          '--info': '59 130 246',
        },
        '.dark': {
          '--bg': '23 23 23',
          '--fg': '229 231 235',
          '--success': '52 211 153',
          '--warning': '251 191 36',
          '--error': '248 113 113',
          '--info': '96 165 250',
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
