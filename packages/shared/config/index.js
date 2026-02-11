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
        // Token-based semantic colors (CSS variable driven)
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          secondary: 'rgb(var(--color-surface-secondary) / <alpha-value>)',
          elevated: 'rgb(var(--color-surface-elevated) / <alpha-value>)',
          inset: 'rgb(var(--color-surface-inset) / <alpha-value>)',
        },
        th: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          inverse: 'rgb(var(--color-text-inverse) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-accent-subtle) / <alpha-value>)',
          muted: 'rgb(var(--color-accent-muted) / <alpha-value>)',
          text: 'rgb(var(--color-accent-text) / <alpha-value>)',
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
          // Surface tokens
          '--color-surface': '255 255 255',
          '--color-surface-secondary': '245 245 245',
          '--color-surface-elevated': '249 250 251',
          '--color-surface-inset': '229 229 229',
          // Text tokens
          '--color-text': '23 23 23',
          '--color-text-secondary': '115 115 115',
          '--color-text-muted': '163 163 163',
          '--color-text-inverse': '255 255 255',
          // Border tokens
          '--color-border': '212 212 212',
          '--color-border-secondary': '229 229 229',
          // Accent tokens (default: blue)
          '--color-accent': '37 99 235',
          '--color-accent-hover': '29 78 216',
          '--color-accent-subtle': '219 234 254',
          '--color-accent-muted': '96 165 250',
          '--color-accent-text': '255 255 255',
        },
        '.dark': {
          '--bg': '23 23 23',
          '--fg': '229 231 235',
          '--success': '52 211 153',
          '--warning': '251 191 36',
          '--error': '248 113 113',
          '--info': '96 165 250',
          // Surface tokens (dark)
          '--color-surface': '23 23 23',
          '--color-surface-secondary': '38 38 38',
          '--color-surface-elevated': '44 44 44',
          '--color-surface-inset': '15 15 15',
          // Text tokens (dark)
          '--color-text': '245 245 245',
          '--color-text-secondary': '163 163 163',
          '--color-text-muted': '115 115 115',
          '--color-text-inverse': '23 23 23',
          // Border tokens (dark)
          '--color-border': '64 64 64',
          '--color-border-secondary': '38 38 38',
          // Accent tokens (dark - same hues, adjusted for dark bg)
          '--color-accent': '59 130 246',
          '--color-accent-hover': '96 165 250',
          '--color-accent-subtle': '23 37 84',
          '--color-accent-muted': '37 99 235',
          '--color-accent-text': '255 255 255',
        },
        // Accent color overrides
        '.accent-purple': {
          '--color-accent': '147 51 234',
          '--color-accent-hover': '126 34 206',
          '--color-accent-subtle': '243 232 255',
          '--color-accent-muted': '192 132 252',
          '--color-accent-text': '255 255 255',
        },
        '.dark .accent-purple, .accent-purple.dark': {
          '--color-accent': '168 85 247',
          '--color-accent-hover': '192 132 252',
          '--color-accent-subtle': '59 7 100',
          '--color-accent-muted': '147 51 234',
        },
        '.accent-emerald': {
          '--color-accent': '5 150 105',
          '--color-accent-hover': '4 120 87',
          '--color-accent-subtle': '209 250 229',
          '--color-accent-muted': '52 211 153',
          '--color-accent-text': '255 255 255',
        },
        '.dark .accent-emerald, .accent-emerald.dark': {
          '--color-accent': '16 185 129',
          '--color-accent-hover': '52 211 153',
          '--color-accent-subtle': '6 78 59',
          '--color-accent-muted': '5 150 105',
        },
        '.accent-rose': {
          '--color-accent': '225 29 72',
          '--color-accent-hover': '190 18 60',
          '--color-accent-subtle': '255 228 230',
          '--color-accent-muted': '251 113 133',
          '--color-accent-text': '255 255 255',
        },
        '.dark .accent-rose, .accent-rose.dark': {
          '--color-accent': '244 63 94',
          '--color-accent-hover': '251 113 133',
          '--color-accent-subtle': '136 19 55',
          '--color-accent-muted': '225 29 72',
        },
        '.accent-amber': {
          '--color-accent': '217 119 6',
          '--color-accent-hover': '180 83 9',
          '--color-accent-subtle': '254 243 199',
          '--color-accent-muted': '251 191 36',
          '--color-accent-text': '255 255 255',
        },
        '.dark .accent-amber, .accent-amber.dark': {
          '--color-accent': '245 158 11',
          '--color-accent-hover': '251 191 36',
          '--color-accent-subtle': '120 53 15',
          '--color-accent-muted': '217 119 6',
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
