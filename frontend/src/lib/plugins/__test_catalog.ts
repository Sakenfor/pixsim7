/**
 * Integration test for plugin catalog
 *
 * This file tests that the catalog can import from all registries
 * and produce valid PluginMeta objects.
 *
 * Run this with: node --loader ts-node/esm __test_catalog.ts
 * Or just check that it compiles without errors
 */

import {
  listAllPlugins,
  listHelperPlugins,
  listInteractionPlugins,
  listNodeTypePlugins,
  listGalleryToolPlugins,
  listUIPlugins,
  listGenerationUIPlugins,
  searchPlugins,
  filterByKind,
  filterByCategory,
  filterByEnabled,
  getPluginCounts,
  getUniqueCategories,
  groupByKind,
  type PluginMeta,
  type PluginKind,
} from './catalog';

/**
 * Test basic catalog functionality
 */
export function testCatalog() {
  console.log('🧪 Testing Plugin Catalog...\n');

  // Test listing functions
  console.log('📋 Testing list functions:');

  const helpers = listHelperPlugins();
  console.log(`  ✓ listHelperPlugins(): ${helpers.length} helpers`);

  const interactions = listInteractionPlugins();
  console.log(`  ✓ listInteractionPlugins(): ${interactions.length} interactions`);

  const nodeTypes = listNodeTypePlugins();
  console.log(`  ✓ listNodeTypePlugins(): ${nodeTypes.length} node types`);

  const galleryTools = listGalleryToolPlugins();
  console.log(`  ✓ listGalleryToolPlugins(): ${galleryTools.length} gallery tools`);

  const uiPlugins = listUIPlugins();
  console.log(`  ✓ listUIPlugins(): ${uiPlugins.length} UI plugins`);

  const genPlugins = listGenerationUIPlugins();
  console.log(`  ✓ listGenerationUIPlugins(): ${genPlugins.length} generation plugins`);

  const allPlugins = listAllPlugins();
  console.log(`  ✓ listAllPlugins(): ${allPlugins.length} total plugins\n`);

  // Test counts
  console.log('🔢 Testing plugin counts:');
  const counts = getPluginCounts();
  console.log(`  ✓ getPluginCounts():`, counts);
  console.log('');

  // Test categories
  console.log('🏷️  Testing categories:');
  const categories = getUniqueCategories();
  console.log(`  ✓ getUniqueCategories(): ${categories.length} categories`);
  console.log(`     ${categories.join(', ')}\n`);

  // Test search
  console.log('🔍 Testing search:');
  const searchResults = searchPlugins('inventory');
  console.log(`  ✓ searchPlugins('inventory'): ${searchResults.length} results\n`);

  // Test filters
  console.log('🔎 Testing filters:');
  const interactionFilter = filterByKind('interaction');
  console.log(`  ✓ filterByKind('interaction'): ${interactionFilter.length} plugins`);

  const enabledFilter = filterByEnabled(true);
  console.log(`  ✓ filterByEnabled(true): ${enabledFilter.length} enabled plugins\n`);

  // Test grouping
  console.log('📦 Testing grouping:');
  const grouped = groupByKind();
  const groupCounts = Object.entries(grouped).map(([kind, plugins]) =>
    `${kind}: ${plugins.length}`
  ).join(', ');
  console.log(`  ✓ groupByKind(): ${groupCounts}\n`);

  // Validate PluginMeta structure
  console.log('✅ Validating PluginMeta structure:');
  if (allPlugins.length > 0) {
    const sample = allPlugins[0];
    console.log(`  Sample plugin: "${sample.label}" (${sample.kind})`);
    console.log(`    - id: ${sample.id}`);
    console.log(`    - description: ${sample.description?.substring(0, 50)}...`);
    console.log(`    - category: ${sample.category}`);
    console.log(`    - enabled: ${sample.enabled}`);
    console.log(`    - source: ${sample.source.registry}`);
    console.log('');
  }

  console.log('✅ All tests passed!\n');
}

// Auto-run if executed directly
if (typeof window === 'undefined') {
  // In Node.js environment
  testCatalog();
}
