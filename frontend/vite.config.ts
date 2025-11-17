import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point pixcubes imports at the local source package
      pixcubes: path.resolve(__dirname, '../../pixcubes/src'),
    },
  },
});
