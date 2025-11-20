import type { Config } from 'tailwindcss'
import preset from '@pixsim7/shared.config'

export default {
  presets: [preset as any],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/shared/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
