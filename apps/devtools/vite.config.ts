import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [
        path.resolve(__dirname, '../main/tsconfig.app.json'),
        path.resolve(__dirname, './tsconfig.app.json'),
      ],
    }),
  ],
  server: {
    port: 5176,
    fs: {
      strict: false,
      allow: [
        path.resolve(__dirname, '.'),
        path.resolve(__dirname, '../main'),
        path.resolve(__dirname, '../../packages'),
      ],
    },
  },
});
