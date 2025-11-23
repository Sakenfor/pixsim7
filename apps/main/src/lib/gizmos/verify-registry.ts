/**
 * Simple verification that the Gizmo Surface Registry works
 * Run this manually to test the registry functionality
 */

import { gizmoSurfaceRegistry } from './surfaceRegistry';
import type { GizmoSurfaceDefinition } from './surfaceRegistry';

// Test registration
const testSurface: GizmoSurfaceDefinition = {
  id: 'test-surface',
  label: 'Test Surface',
  description: 'A test gizmo surface',
  icon: '🎮',
  category: 'debug',
  supportsContexts: ['scene-editor', 'workspace'],
  tags: ['test', 'debug'],
  priority: 5,
};

console.log('Registering test surface...');
gizmoSurfaceRegistry.register(testSurface);

console.log('Registry count:', gizmoSurfaceRegistry.count);
console.log('Has test-surface:', gizmoSurfaceRegistry.has('test-surface'));
console.log('Get test-surface:', gizmoSurfaceRegistry.get('test-surface'));

console.log('\n✅ Gizmo Surface Registry verification complete!');
