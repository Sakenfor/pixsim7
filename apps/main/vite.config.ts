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
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: path.resolve(__dirname, 'src/test/vitest.setup.ts'),
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    reporters: process.env.PIXSIM_TEST_SUBMIT
      ? ['default', [path.resolve(__dirname, '../../tools/vitest-reporter/pixsim-reporter.ts'), {}]]
      : ['default'],
  },
});
