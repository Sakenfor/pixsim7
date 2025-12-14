#!/usr/bin/env tsx
/**
 * Plugin Bundle Builder
 *
 * Builds a plugin into a self-contained bundle with manifest.json and plugin.js.
 *
 * Usage:
 *   pnpm build:plugin scene/comic-panel-view
 *   pnpm build:plugins                      # Build all plugins
 *
 * The script:
 * 1. Reads the plugin's manifest.ts
 * 2. Bundles the plugin code using esbuild
 * 3. Outputs manifest.json and plugin.js to dist/plugins/{family}/{id}/
 */

import { build, BuildOptions } from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

// ===== Configuration =====

const APPS_MAIN_DIR = path.resolve(__dirname, '../apps/main');
const PLUGINS_SRC_DIR = path.join(APPS_MAIN_DIR, 'src/plugins');
const PLUGINS_DIST_DIR = path.join(APPS_MAIN_DIR, 'dist/plugins');

// Path aliases for esbuild - only for types that need to be resolved
const PATH_ALIASES: Record<string, string> = {
  // Shared type packages (these only export types)
  '@pixsim7/shared.types': path.join(__dirname, '../packages/shared/types/src/index.ts'),
};

// External dependencies (provided by host application)
// These are NOT bundled - the host app must provide them at runtime
const EXTERNAL_DEPS = [
  // React
  'react',
  'react-dom',
  'react/jsx-runtime',

  // SDK modules (provided by host app)
  '@features/*',
  '@lib/*',
  '@pixsim7/*',
  '@/stores/*',
  '@/components/*',

  // Node built-ins (shouldn't be in browser bundles)
  'fs',
  'path',
  'node:fs',
  'node:path',
];

// ===== Types =====

interface PluginBuildConfig {
  pluginPath: string;      // Relative path like "scene/comic-panel-view"
  entryPoint: string;      // Full path to entry file
  outputDir: string;       // Initial output directory (overridden by manifest family)
  family: string;          // Directory family (e.g., "scene")
  id: string;              // Plugin ID (e.g., "comic-panel-view")
}

interface BuildResult {
  success: boolean;
  pluginPath: string;
  outputDir?: string;
  manifestPath?: string;
  bundlePath?: string;
  error?: string;
}

// ===== Helper Functions =====

/**
 * Find the entry point for a plugin
 */
async function findEntryPoint(pluginDir: string): Promise<string | null> {
  const candidates = ['index.tsx', 'index.ts', 'plugin.tsx', 'plugin.ts'];

  for (const candidate of candidates) {
    const entryPath = path.join(pluginDir, candidate);
    if (existsSync(entryPath)) {
      return entryPath;
    }
  }

  return null;
}

/**
 * Load and convert TypeScript manifest to JSON
 */
async function loadManifest(pluginDir: string): Promise<Record<string, unknown> | null> {
  const manifestPath = path.join(pluginDir, 'manifest.ts');

  if (!existsSync(manifestPath)) {
    return null;
  }

  // Use esbuild to bundle and evaluate the manifest
  const result = await build({
    entryPoints: [manifestPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    alias: PATH_ALIASES,
    external: ['@lib/plugins/*'],
  });

  // Extract the bundled code
  const code = result.outputFiles?.[0]?.text;
  if (!code) {
    throw new Error('Failed to bundle manifest');
  }

  // Create a temporary file to import
  const tempFile = path.join(pluginDir, '.manifest-temp.mjs');
  await fs.writeFile(tempFile, code);

  try {
    // Dynamic import the bundled manifest
    const manifestModule = await import(`file://${tempFile}`);
    return manifestModule.manifest || manifestModule.default;
  } finally {
    // Clean up temp file
    await fs.unlink(tempFile).catch(() => {});
  }
}

/**
 * Build a single plugin bundle
 */
async function buildPlugin(config: PluginBuildConfig): Promise<BuildResult> {
  const { pluginPath, entryPoint, outputDir, family, id } = config;

  console.log(`\n  Building ${pluginPath}...`);

  try {
    // Load manifest
    const pluginDir = path.dirname(entryPoint);
    const manifest = await loadManifest(pluginDir);

    if (!manifest) {
      throw new Error('No manifest.ts found');
    }

    const manifestFamily = (
      typeof manifest.family === 'string' ? manifest.family : null
    );

    if (!manifestFamily) {
      throw new Error('Plugin manifest must include a `family` string (e.g., "scene", "ui", "tool").');
    }

    if (manifestFamily !== family) {
      console.warn(
        `    [warn] Manifest family "${manifestFamily}" differs from folder "${family}". Using manifest-defined family.`
      );
    }

    const finalOutputDir = path.join(PLUGINS_DIST_DIR, manifestFamily, id);
    await fs.mkdir(finalOutputDir, { recursive: true });

    // Update manifest with bundle-specific values
    manifest.main = 'plugin.js';

    // Write manifest.json
    const manifestPath = path.join(finalOutputDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`    [ok] manifest.json`);

    // Build plugin bundle
    const buildOptions: BuildOptions = {
      entryPoints: [entryPoint],
      bundle: true,
      write: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      outfile: path.join(finalOutputDir, 'plugin.js'),
      sourcemap: true,
      minify: false, // Keep readable for debugging
      alias: PATH_ALIASES,
      external: EXTERNAL_DEPS,
      jsx: 'automatic',
      jsxImportSource: 'react',
      // Preserve exports
      treeShaking: true,
      // Handle CSS
      loader: {
        '.css': 'text',
      },
      // Define globals
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      // Banner to mark as plugin bundle
      banner: {
        js: `// PixSim7 Plugin Bundle: ${pluginPath}\n// Generated: ${new Date().toISOString()}\n`,
      },
    };

    await build(buildOptions);
    console.log(`    [ok] plugin.js`);

    // Also copy source map
    console.log(`    [ok] plugin.js.map`);

    return {
      success: true,
      pluginPath,
      outputDir: finalOutputDir,
      manifestPath,
      bundlePath: path.join(finalOutputDir, 'plugin.js'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`    [error] ${message}`);

    return {
      success: false,
      pluginPath,
      error: message,
    };
  }
}

/**
 * Discover all buildable plugins
 */
async function discoverPlugins(): Promise<PluginBuildConfig[]> {
  const configs: PluginBuildConfig[] = [];

  // Walk through plugin families
  const families = await fs.readdir(PLUGINS_SRC_DIR).catch(() => []);

  for (const family of families) {
    const familyPath = path.join(PLUGINS_SRC_DIR, family);
    const stat = await fs.stat(familyPath).catch(() => null);

    if (!stat?.isDirectory()) continue;

    // Walk through plugins in this family
    const plugins = await fs.readdir(familyPath).catch(() => []);

    for (const pluginId of plugins) {
      const pluginDir = path.join(familyPath, pluginId);
      const pluginStat = await fs.stat(pluginDir).catch(() => null);

      if (!pluginStat?.isDirectory()) continue;

      // Check if this directory has a manifest (indicating it's a bundleable plugin)
      const hasManifest = existsSync(path.join(pluginDir, 'manifest.ts'));
      if (!hasManifest) continue;

      const entryPoint = await findEntryPoint(pluginDir);
      if (!entryPoint) continue;

      configs.push({
        pluginPath: `${family}/${pluginId}`,
        entryPoint,
        outputDir: path.join(PLUGINS_DIST_DIR, family, pluginId),
        family,
        id: pluginId,
      });
    }
  }

  return configs;
}

/**
 * Parse a plugin path argument
 */
function parsePluginPath(arg: string): { family: string; id: string } | null {
  const parts = arg.split('/');
  if (parts.length === 2) {
    return { family: parts[0], id: parts[1] };
  }
  return null;
}

// ===== Main CLI =====

async function main() {
  const args = process.argv.slice(2);

  console.log('🔌 PixSim7 Plugin Bundle Builder\n');

  // Parse arguments
  const pluginPaths: string[] = [];
  let buildAll = false;
  let verbose = false;

  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      buildAll = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      pluginPaths.push(arg);
    }
  }

  // Discover or filter plugins
  let plugins: PluginBuildConfig[];

  if (buildAll || pluginPaths.length === 0) {
    console.log('Discovering plugins...');
    plugins = await discoverPlugins();

    if (plugins.length === 0) {
      console.log('No buildable plugins found.\n');
      console.log('Buildable plugins must have:');
      console.log('  - manifest.ts file');
      console.log('  - index.ts(x) or plugin.ts(x) entry point\n');
      process.exit(0);
    }

    console.log(`Found ${plugins.length} buildable plugin(s)`);
  } else {
    plugins = [];

    for (const pluginPath of pluginPaths) {
      const parsed = parsePluginPath(pluginPath);

      if (!parsed) {
        console.error(`Invalid plugin path: ${pluginPath}`);
        console.error('Expected format: family/plugin-id (e.g., scene/comic-panel-view)\n');
        process.exit(1);
      }

      const pluginDir = path.join(PLUGINS_SRC_DIR, parsed.family, parsed.id);

      if (!existsSync(pluginDir)) {
        console.error(`Plugin not found: ${pluginPath}`);
        console.error(`Expected at: ${pluginDir}\n`);
        process.exit(1);
      }

      const entryPoint = await findEntryPoint(pluginDir);

      if (!entryPoint) {
        console.error(`No entry point found for: ${pluginPath}`);
        console.error('Expected: index.ts(x) or plugin.ts(x)\n');
        process.exit(1);
      }

      plugins.push({
        pluginPath,
        entryPoint,
        outputDir: path.join(PLUGINS_DIST_DIR, parsed.family, parsed.id),
        family: parsed.family,
        id: parsed.id,
      });
    }
  }

  // Build plugins
  console.log('\nBuilding plugins...');

  const results: BuildResult[] = [];

  for (const plugin of plugins) {
    const result = await buildPlugin(plugin);
    results.push(result);
  }

  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n' + '─'.repeat(50));
  console.log(`\n✅ Build complete: ${successful.length} succeeded, ${failed.length} failed\n`);

  if (successful.length > 0) {
    console.log('Built plugins:');
    for (const result of successful) {
      console.log(`  ✓ ${result.pluginPath} → ${result.outputDir}`);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed plugins:');
    for (const result of failed) {
      console.log(`  ✗ ${result.pluginPath}: ${result.error}`);
    }
    process.exit(1);
  }

  console.log('\nPlugin bundles are ready for use!');
  console.log('The manifest loader will automatically discover them from dist/plugins/\n');
}

// Run
main().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
