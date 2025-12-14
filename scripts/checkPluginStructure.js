#!/usr/bin/env node
/**
 * Plugin Structure Consistency Check
 *
 * Verifies that feature plugins follow the standard pattern:
 * - features/{feature}/plugins/index.ts exists
 * - index.ts exports a builtIn*Plugins array
 *
 * Usage: node scripts/checkPluginStructure.js
 *
 * See docs/PLUGIN_ARCHITECTURE.md for the standard pattern.
 */

const fs = require('fs');
const path = require('path');

const FEATURES_DIR = path.join(__dirname, '../apps/main/src/features');

// Features that should have plugins following the standard pattern
const PLUGIN_FEATURES = [
  { name: 'worldTools', exportName: 'builtInWorldTools' },
  { name: 'brainTools', exportName: 'builtInBrainTools' },
  { name: 'gallery', exportName: 'builtInGalleryTools' },
  { name: 'gizmos', exportName: 'builtInGizmoSurfaces' },
  { name: 'devtools', exportName: 'builtInDevTools' },
];

function checkFeature(feature) {
  const result = {
    feature: feature.name,
    hasPluginsDir: false,
    hasIndexFile: false,
    hasBuiltInExport: false,
    errors: [],
  };

  const pluginsDir = path.join(FEATURES_DIR, feature.name, 'plugins');
  const indexFile = path.join(pluginsDir, 'index.ts');

  // Check if plugins directory exists
  if (fs.existsSync(pluginsDir) && fs.statSync(pluginsDir).isDirectory()) {
    result.hasPluginsDir = true;
  } else {
    result.errors.push(`Missing plugins/ directory at features/${feature.name}/plugins/`);
  }

  // Check if index.ts exists
  if (fs.existsSync(indexFile)) {
    result.hasIndexFile = true;

    // Check if index.ts exports builtIn*Plugins
    const content = fs.readFileSync(indexFile, 'utf-8');
    if (content.includes(feature.exportName)) {
      result.hasBuiltInExport = true;
    } else {
      result.errors.push(
        `Missing '${feature.exportName}' export in features/${feature.name}/plugins/index.ts`
      );
    }
  } else {
    result.errors.push(`Missing index.ts at features/${feature.name}/plugins/index.ts`);
  }

  return result;
}

function main() {
  console.log('Plugin Structure Consistency Check');
  console.log('==================================\n');

  let hasErrors = false;
  const results = [];

  for (const feature of PLUGIN_FEATURES) {
    const result = checkFeature(feature);
    results.push(result);

    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }

  // Print results
  for (const result of results) {
    const status = result.errors.length === 0 ? '✅' : '❌';
    console.log(`${status} ${result.feature}`);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`   └─ ${error}`);
      }
    } else {
      const exportName = PLUGIN_FEATURES.find(f => f.name === result.feature)?.exportName;
      console.log(`   └─ plugins/index.ts exports ${exportName}`);
    }
    console.log();
  }

  // Summary
  console.log('Summary');
  console.log('-------');
  const passing = results.filter(r => r.errors.length === 0).length;
  const failing = results.filter(r => r.errors.length > 0).length;
  console.log(`Passing: ${passing}/${results.length}`);
  console.log(`Failing: ${failing}/${results.length}`);

  if (hasErrors) {
    console.log('\n❌ Some features do not follow the standard plugin pattern.');
    console.log('See docs/PLUGIN_ARCHITECTURE.md for guidance.');
    process.exit(1);
  } else {
    console.log('\n✅ All features follow the standard plugin pattern!');
    process.exit(0);
  }
}

main();
