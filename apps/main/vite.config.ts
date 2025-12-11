import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Domain-based path aliases (must come before generic '@' to take precedence)
      { find: '@/narrative', replacement: path.resolve(__dirname, '../../packages/game/engine/src/narrative') },
      { find: '@/scene', replacement: path.resolve(__dirname, '../../packages/game/engine/src/narrative') },
      { find: '@/gizmos', replacement: path.resolve(__dirname, './src/lib/gizmos') },
      { find: '@/types', replacement: path.resolve(__dirname, './src/types') },
      { find: '@shared/types', replacement: path.resolve(__dirname, '../../packages/shared/types/src') },
      // Feature modules
      { find: '@features/intimacy', replacement: path.resolve(__dirname, './src/features/intimacy') },
      { find: '@features/automation', replacement: path.resolve(__dirname, './src/features/automation') },
      { find: '@features/interactions', replacement: path.resolve(__dirname, './src/features/interactions') },
      // Workspace packages
      { find: '@pixsim7/scene.cubes', replacement: path.resolve(__dirname, '../../packages/scene/cubes/src') },
      // Local src directory alias for cleaner imports (must be last)
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
