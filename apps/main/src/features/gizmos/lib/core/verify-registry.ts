/**
 * Simple verification that the Gizmo Surface catalog selectors work
 * Run this manually to test the catalog functionality
 */

import { gizmoSurfaceSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import type { GizmoSurfaceDefinition } from './surfaceRegistry';

// Test registration
const testSurface: GizmoSurfaceDefinition = {
  id: 'test-surface',
  label: 'Test Surface',
  description: 'A test gizmo surface',
  icon: 'dYZr',
  category: 'debug',
  supportsContexts: ['scene-editor', 'workspace'],
  tags: ['test', 'debug'],
  priority: 5,
};

async function runVerification() {
  console.log('Registering test surface...');
  await registerPluginDefinition({
    id: testSurface.id,
    family: 'gizmo-surface',
    origin: 'dev-project',
    source: 'source',
    plugin: testSurface,
  });

  console.log('Surface count:', gizmoSurfaceSelectors.count);
  console.log('Has test-surface:', gizmoSurfaceSelectors.has('test-surface'));
  console.log('Get test-surface:', gizmoSurfaceSelectors.get('test-surface'));

  console.log('\n✓ Gizmo Surface selectors verification complete!');
}

void runVerification();
