import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Domain-based path aliases
      '@/narrative': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
      '@/scene': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
      '@/gizmos': path.resolve(__dirname, '../main/src/lib/gizmos'),
      '@/types': path.resolve(__dirname, '../../packages/shared/types/src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/game/v1': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/game\/v1/, '/api/v1/game'),
      },
      '/game/health': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/game\//, '/'),
      },
    },
  },
})
