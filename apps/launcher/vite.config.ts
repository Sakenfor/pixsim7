import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    proxy: {
      '/services': 'http://localhost:8100',
      '/logs': 'http://localhost:8100',
      '/events': { target: 'http://localhost:8100', ws: true },
      '/health': 'http://localhost:8100',
      '/buildables': 'http://localhost:8100',
      '/settings': 'http://localhost:8100',
    },
  },
})
