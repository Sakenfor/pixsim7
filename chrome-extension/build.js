/**
 * Chrome Extension Build Script
 *
 * Bundles player scripts with workspace dependencies.
 * Run: pnpm build (one-time) or pnpm dev (watch mode)
 */
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Copy dockview CSS to dist
function copyDockviewCSS() {
  const srcPath = path.resolve(__dirname, 'node_modules/dockview-core/dist/styles/dockview.css');
  const destPath = path.resolve(__dirname, 'dist/dockview.css');

  // Try local node_modules first, then root
  let cssPath = srcPath;
  if (!fs.existsSync(cssPath)) {
    cssPath = path.resolve(__dirname, '../node_modules/dockview-core/dist/styles/dockview.css');
  }
  if (!fs.existsSync(cssPath)) {
    // Try apps/main as fallback (pnpm hoisting)
    cssPath = path.resolve(__dirname, '../apps/main/node_modules/dockview-core/dist/styles/dockview.css');
  }

  if (fs.existsSync(cssPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(cssPath, destPath);
    console.log('Copied dockview.css to dist/');
  } else {
    console.warn('Warning: dockview.css not found');
  }
}

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
    '@pixsim7/shared.media.core': path.resolve(__dirname, '../packages/shared/media/core/src/index.ts'),
    '@pixsim7/shared.player.core': path.resolve(__dirname, '../packages/shared/player/core/src/index.ts'),
  },
  loader: {
    '.ts': 'ts',
  },
};

async function build() {
  console.log('Building extension...');

  try {
    // Copy dockview CSS
    copyDockviewCSS();

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
