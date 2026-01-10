/**
 * HUD Layout Store Tests
 *
 * Verification tests for Phase 58.1
 */

import { createComposition } from '@pixsim7/composer-core';

import { useHudLayoutStore } from '@features/hud';

import type { HudRegionLayout } from './types';

/**
 * Manual test suite for HUD Layout Store
 * Run this in a React component or browser console to verify functionality
 */
export function testHudLayoutStore() {
  const store = useHudLayoutStore.getState();
  const results: string[] = [];

  // Test 1: Create a new HUD layout
  console.log('Test 1: Creating HUD layout...');
  const layout = store.createLayout(1, 'Test HUD Layout');
  if (layout && layout.worldId === 1 && layout.name === 'Test HUD Layout') {
    results.push('✓ Test 1: Create layout');
  } else {
    results.push('✗ Test 1: Create layout failed');
  }

  // Test 2: Add a region to the layout
  console.log('Test 2: Adding region...');
  const topRegion: HudRegionLayout = {
    region: 'top',
    composition: createComposition('top-bar', 'Top Bar', 12, 2),
    enabled: true,
  };
  store.addRegion(layout.id, topRegion);
  const updatedLayout = store.getLayout(layout.id);
  if (updatedLayout && updatedLayout.regions.length === 1) {
    results.push('✓ Test 2: Add region');
  } else {
    results.push('✗ Test 2: Add region failed');
  }

  // Test 3: Update region
  console.log('Test 3: Updating region...');
  store.updateRegion(layout.id, 'top', { enabled: false });
  const layoutAfterUpdate = store.getLayout(layout.id);
  if (layoutAfterUpdate && layoutAfterUpdate.regions[0].enabled === false) {
    results.push('✓ Test 3: Update region');
  } else {
    results.push('✗ Test 3: Update region failed');
  }

  // Test 4: Get layouts for world
  console.log('Test 4: Getting layouts for world...');
  const worldLayouts = store.getLayoutsForWorld(1);
  if (worldLayouts.length >= 1) {
    results.push('✓ Test 4: Get layouts for world');
  } else {
    results.push('✗ Test 4: Get layouts for world failed');
  }

  // Test 5: Set default layout
  console.log('Test 5: Setting default layout...');
  store.setDefaultLayout(1, layout.id);
  const defaultLayout = store.getDefaultLayoutForWorld(1);
  if (defaultLayout && defaultLayout.id === layout.id && defaultLayout.isDefault === true) {
    results.push('✓ Test 5: Set default layout');
  } else {
    results.push('✗ Test 5: Set default layout failed');
  }

  // Test 6: Apply preset
  console.log('Test 6: Applying preset...');
  const presetLayout = store.applyPreset(2, 'story-hud');
  if (presetLayout && presetLayout.worldId === 2) {
    results.push('✓ Test 6: Apply preset');
  } else {
    results.push('✗ Test 6: Apply preset failed');
  }

  // Test 7: Clone layout
  console.log('Test 7: Cloning layout...');
  const clonedLayout = store.cloneLayout(layout.id, 'Cloned HUD');
  if (clonedLayout && clonedLayout.id !== layout.id && clonedLayout.name === 'Cloned HUD') {
    results.push('✓ Test 7: Clone layout');
  } else {
    results.push('✗ Test 7: Clone layout failed');
  }

  // Test 8: Export/Import layout
  console.log('Test 8: Export/Import layout...');
  const exported = store.exportLayout(layout.id);
  if (exported) {
    const imported = store.importLayout(exported);
    if (imported && imported.id !== layout.id && imported.regions.length === 1) {
      results.push('✓ Test 8: Export/Import layout');
    } else {
      results.push('✗ Test 8: Export/Import layout failed');
    }
  } else {
    results.push('✗ Test 8: Export failed');
  }

  // Test 9: Delete layout
  console.log('Test 9: Deleting layout...');
  const layoutToDelete = store.createLayout(99, 'Temporary');
  store.deleteLayout(layoutToDelete.id);
  const deletedLayout = store.getLayout(layoutToDelete.id);
  if (!deletedLayout) {
    results.push('✓ Test 9: Delete layout');
  } else {
    results.push('✗ Test 9: Delete layout failed');
  }

  // Test 10: Remove region
  console.log('Test 10: Removing region...');
  store.removeRegion(layout.id, 'top');
  const layoutAfterRemove = store.getLayout(layout.id);
  if (layoutAfterRemove && layoutAfterRemove.regions.length === 0) {
    results.push('✓ Test 10: Remove region');
  } else {
    results.push('✗ Test 10: Remove region failed');
  }

  console.log('\n=== Test Results ===');
  results.forEach((result) => console.log(result));

  const passed = results.filter((r) => r.startsWith('✓')).length;
  const total = results.length;
  console.log(`\nPassed: ${passed}/${total}`);

  return { passed, total, results };
}

// Export for easy testing
if (typeof window !== 'undefined') {
  (window as any).testHudLayoutStore = testHudLayoutStore;
}
