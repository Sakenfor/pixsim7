/**
 * Test: Scene Editor Runtime Mapping
 *
 * Verifies that draft.edges are correctly converted to runtime Scene.edges
 * with proper isDefault flag based on fromPort metadata.
 */

import { sceneBuilderModule } from '../frontend/src/modules/scene-builder';
import type { Scene } from '@pixsim7/types';

function testRuntimeMapping() {
  console.log('\n=== Test: Scene Runtime Mapping ===\n');

  // Create a draft scene
  const draft = sceneBuilderModule.createDraft?.('Test Scene');
  if (!draft) throw new Error('Failed to create draft');

  // Add two nodes
  sceneBuilderModule.addNode?.({
    id: 'node_1',
    type: 'video',
    metadata: { label: 'Node 1' },
  });

  sceneBuilderModule.addNode?.({
    id: 'node_2',
    type: 'video',
    metadata: { label: 'Node 2' },
  });

  // Connect with different ports
  // Edge 1: default port (should have isDefault=true)
  sceneBuilderModule.connectNodes?.('node_1', 'node_2', {
    fromPort: 'default',
    toPort: 'input',
  });

  // Edge 2: success port (should have isDefault=false)
  sceneBuilderModule.connectNodes?.('node_1', 'node_2', {
    fromPort: 'success',
    toPort: 'input',
  });

  // Get the draft and verify edges exist
  const currentDraft = sceneBuilderModule.getDraft?.();
  console.log('Draft edges:', JSON.stringify(currentDraft?.edges, null, 2));

  if (!currentDraft || currentDraft.edges.length !== 2) {
    throw new Error(
      `Expected 2 edges in draft, got ${currentDraft?.edges.length || 0}`
    );
  }

  // Convert to runtime scene
  let runtimeScene: Scene;
  try {
    runtimeScene = sceneBuilderModule.toRuntimeScene?.()!;
  } catch (error) {
    throw new Error(`Failed to convert to runtime scene: ${error}`);
  }

  console.log('Runtime edges:', JSON.stringify(runtimeScene.edges, null, 2));

  // Assertions
  if (runtimeScene.edges.length !== 2) {
    throw new Error(
      `Expected 2 edges in runtime scene, got ${runtimeScene.edges.length}`
    );
  }

  // Find the default edge
  const defaultEdge = runtimeScene.edges.find(
    (e) => e.id.includes('default')
  );
  if (!defaultEdge) {
    throw new Error('Could not find default edge in runtime scene');
  }

  // Find the success edge
  const successEdge = runtimeScene.edges.find(
    (e) => e.id.includes('success')
  );
  if (!successEdge) {
    throw new Error('Could not find success edge in runtime scene');
  }

  // Assert isDefault flag
  if (defaultEdge.isDefault !== true) {
    throw new Error(
      `Expected default edge to have isDefault=true, got ${defaultEdge.isDefault}`
    );
  }

  if (successEdge.isDefault === true) {
    throw new Error(
      `Expected success edge to have isDefault=false or undefined, got ${successEdge.isDefault}`
    );
  }

  console.log('✅ Default edge has isDefault=true');
  console.log('✅ Success edge has isDefault=false (or undefined)');
  console.log('\n=== Test PASSED ===\n');

  // Cleanup
  sceneBuilderModule.clearDraft?.();
}

// Run test if executed directly
if (require.main === module) {
  try {
    testRuntimeMapping();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test FAILED:', error);
    process.exit(1);
  }
}

export { testRuntimeMapping };
