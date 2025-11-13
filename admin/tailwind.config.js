/** @type {import('tailwindcss').Config} */
import sharedPreset from '../packages/config-tailwind/index.js';

export default {
  presets: [sharedPreset],
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Admin-specific additions (shared preset provides base tokens)
        'log-error': '#ef4444',    // red-500
        'log-warning': '#f59e0b',  // amber-500
        'log-info': '#3b82f6',     // blue-500
        'log-debug': '#6b7280',    // gray-500
        'log-critical': '#dc2626', // red-600
      }
    },
  },
  plugins: [],
}
