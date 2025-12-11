import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Local src directory alias for cleaner imports
      '@': path.resolve(__dirname, './src'),
      // Domain-based path aliases
      '@/narrative': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
      '@/scene': path.resolve(__dirname, '../../packages/game/engine/src/narrative'),
      '@/gizmos': path.resolve(__dirname, './src/lib/gizmos'),
      '@/types': path.resolve(__dirname, '../../packages/shared/types/src'),
      // Point scene.cubes imports at the workspace package
      '@pixsim7/scene.cubes': path.resolve(__dirname, '../../packages/scene/cubes/src'),
    },
  },
});
