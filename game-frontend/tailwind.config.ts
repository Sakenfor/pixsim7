import type { Config } from 'tailwindcss'
import preset from '@pixsim7/config-tailwind'

export default {
  presets: [preset as any],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
