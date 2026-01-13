/**
 * Chrome Extension Build Script
 *
 * Bundles player scripts with workspace dependencies.
 * Run: pnpm build (one-time) or pnpm dev (watch mode)
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Player bundle - combines all player scripts with geometry imports
const playerConfig = {
  entryPoints: ['player/player-bundle.js'],
  bundle: true,
  outfile: 'dist/player.bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  sourcemap: true,
  minify: !isWatch,
  // Resolve workspace packages
  alias: {
    '@pixsim7/graphics.geometry': path.resolve(__dirname, '../packages/graphics/geometry/src/index.ts'),
  },
  loader: {
    '.ts': 'ts',
  },
};

async function build() {
  console.log('Building extension...');

  try {
    if (isWatch) {
      // Watch mode
      const ctx = await esbuild.context(playerConfig);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      // One-time build
      await esbuild.build(playerConfig);
      console.log('Build complete: dist/player.bundle.js');
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
