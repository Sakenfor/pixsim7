import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [path.resolve(__dirname, '../main/tsconfig.app.json')],
    }),
  ],
  resolve: {
    alias: [{ find: '@devtools', replacement: path.resolve(__dirname, './src') }],
  },
  server: {
    port: 5176,
  },
});
