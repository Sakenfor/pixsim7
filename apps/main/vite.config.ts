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
      // Lib modules - Core registries & systems
      { find: '@lib/core', replacement: path.resolve(__dirname, './src/lib/core') },
      { find: '@lib/panels', replacement: path.resolve(__dirname, './src/lib/panels') },
      { find: '@lib/shapes', replacement: path.resolve(__dirname, './src/lib/shapes') },
      { find: '@lib/widgets', replacement: path.resolve(__dirname, './src/lib/widgets') },
      { find: '@lib/api', replacement: path.resolve(__dirname, './src/lib/api') },
      // Lib modules - Infrastructure
      { find: '@lib/utils', replacement: path.resolve(__dirname, './src/lib/utils') },
      { find: '@lib/auth', replacement: path.resolve(__dirname, './src/lib/auth') },
      { find: '@lib/theming', replacement: path.resolve(__dirname, './src/lib/theming') },
      { find: '@lib/game', replacement: path.resolve(__dirname, './src/lib/game') },
      { find: '@lib/hooks', replacement: path.resolve(__dirname, './src/lib/hooks') },
      { find: '@lib/analyzers', replacement: path.resolve(__dirname, './src/lib/analyzers') },
      { find: '@lib/context', replacement: path.resolve(__dirname, './src/lib/context') },
      { find: '@lib/display', replacement: path.resolve(__dirname, './src/lib/display') },
      // Feature modules
      { find: '@features/gizmos', replacement: path.resolve(__dirname, './src/features/gizmos') },
      { find: '@features/intimacy', replacement: path.resolve(__dirname, './src/features/intimacy') },
      { find: '@features/automation', replacement: path.resolve(__dirname, './src/features/automation') },
      { find: '@features/interactions', replacement: path.resolve(__dirname, './src/features/interactions') },
      { find: '@features/prompts', replacement: path.resolve(__dirname, './src/features/prompts') },
      { find: '@features/providers', replacement: path.resolve(__dirname, './src/features/providers') },
      { find: '@features/settings', replacement: path.resolve(__dirname, './src/features/settings') },
      { find: '@features/gallery', replacement: path.resolve(__dirname, './src/features/gallery') },
      { find: '@features/scene', replacement: path.resolve(__dirname, './src/features/scene') },
      { find: '@features/hud', replacement: path.resolve(__dirname, './src/features/hud') },
      { find: '@features/worldTools', replacement: path.resolve(__dirname, './src/features/worldTools') },
      { find: '@features/brainTools', replacement: path.resolve(__dirname, './src/features/brainTools') },
      { find: '@features/simulation', replacement: path.resolve(__dirname, './src/features/simulation') },
      { find: '@features/generation', replacement: path.resolve(__dirname, './src/features/generation') },
      { find: '@features/graph', replacement: path.resolve(__dirname, './src/features/graph') },
      { find: '@features/assets', replacement: path.resolve(__dirname, './src/features/assets') },
      { find: '@features/controlCenter', replacement: path.resolve(__dirname, './src/features/controlCenter') },
      // Workspace packages
      { find: '@pixsim7/scene.cubes', replacement: path.resolve(__dirname, '../../packages/scene/cubes/src') },
      // Local src directory alias for cleaner imports (must be last)
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
