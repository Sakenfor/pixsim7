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
      { find: '@features/prompts', replacement: path.resolve(__dirname, './src/features/prompts') },
      { find: '@features/gallery', replacement: path.resolve(__dirname, './src/features/gallery') },
      { find: '@features/scene', replacement: path.resolve(__dirname, './src/features/scene') },
      { find: '@features/hud', replacement: path.resolve(__dirname, './src/features/hud') },
      { find: '@features/worldTools', replacement: path.resolve(__dirname, './src/features/worldTools') },
      { find: '@features/brainTools', replacement: path.resolve(__dirname, './src/features/brainTools') },
      { find: '@features/simulation', replacement: path.resolve(__dirname, './src/features/simulation') },
      { find: '@features/generation', replacement: path.resolve(__dirname, './src/features/generation') },
      { find: '@features/graph', replacement: path.resolve(__dirname, './src/features/graph') },
      // Workspace packages
      { find: '@pixsim7/scene.cubes', replacement: path.resolve(__dirname, '../../packages/scene/cubes/src') },
      // Local src directory alias for cleaner imports (must be last)
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
