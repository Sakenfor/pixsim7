import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [path.resolve(__dirname, './tsconfig.app.json')],
    }),
  ],
  server: {
    proxy: {
      // Proxy /devtools to the devtools dev server
      // This allows both apps to share the same origin (localStorage)
      '/devtools': {
        target: 'http://localhost:5176',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/devtools/, ''),
        ws: true,
      },
    },
  },
});
