/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Log level colors
        'log-error': '#ef4444',    // red-500
        'log-warning': '#f59e0b',  // yellow-500/amber-500
        'log-info': '#3b82f6',     // blue-500
        'log-debug': '#6b7280',    // gray-500
        'log-critical': '#dc2626', // red-600

        // UI colors
        primary: '#3b82f6',        // blue-500
        success: '#10b981',        // green-500
        danger: '#ef4444',         // red-500

        // Dark theme
        dark: {
          DEFAULT: '#1f2937',      // gray-800
          lighter: '#374151',      // gray-700
          darker: '#111827',       // gray-900
        }
      }
    },
  },
  plugins: [],
}
