/**
 * Test: Node Palette Integration
 *
 * Verifies that nodes can be created from the palette and
 * that the first node automatically becomes the start node.
 */

import { sceneBuilderModule } from '../frontend/src/modules/scene-builder';

function testNodePaletteIntegration() {
  console.log('\n=== Test: Node Palette Integration ===\n');

  // Clear any existing draft
  sceneBuilderModule.clearDraft?.();

  // Create a new draft
  const draft = sceneBuilderModule.createDraft?.('Palette Test Scene');
  if (!draft) throw new Error('Failed to create draft');

  console.log('✅ Draft created');

  // Verify no start node initially
  if (draft.startNodeId) {
    throw new Error('Draft should not have a start node initially');
  }
  console.log('✅ No start node initially');

  // Add first node (should become start node)
  sceneBuilderModule.addNode?.({
    id: 'video_1',
    type: 'video',
    metadata: {
      label: 'Video 1',
      position: { x: 100, y: 100 },
    },
  });

  const draftAfterFirst = sceneBuilderModule.getDraft?.();
  if (!draftAfterFirst?.startNodeId) {
    throw new Error('First node should automatically become start node');
  }
  if (draftAfterFirst.startNodeId !== 'video_1') {
    throw new Error(
      `Expected startNodeId to be 'video_1', got '${draftAfterFirst.startNodeId}'`
    );
  }
  console.log('✅ First node automatically set as start node');

  // Add more nodes
  sceneBuilderModule.addNode?.({
    id: 'choice_1',
    type: 'choice',
    metadata: {
      label: 'Choice 1',
      position: { x: 200, y: 100 },
    },
  });

  sceneBuilderModule.addNode?.({
    id: 'end_1',
    type: 'end',
    metadata: {
      label: 'End 1',
      position: { x: 300, y: 100 },
    },
  });

  const finalDraft = sceneBuilderModule.getDraft?.();
  if (!finalDraft) throw new Error('Draft disappeared');

  // Verify we have 3 nodes
  if (finalDraft.nodes.length !== 3) {
    throw new Error(`Expected 3 nodes, got ${finalDraft.nodes.length}`);
  }
  console.log('✅ Created 3 nodes total');

  // Verify start node unchanged
  if (finalDraft.startNodeId !== 'video_1') {
    throw new Error(
      `Start node should still be 'video_1', got '${finalDraft.startNodeId}'`
    );
  }
  console.log('✅ Start node remained unchanged');

  // Verify node types
  const videoNode = finalDraft.nodes.find((n) => n.id === 'video_1');
  const choiceNode = finalDraft.nodes.find((n) => n.id === 'choice_1');
  const endNode = finalDraft.nodes.find((n) => n.id === 'end_1');

  if (!videoNode || videoNode.type !== 'video') {
    throw new Error('Video node not found or wrong type');
  }
  if (!choiceNode || choiceNode.type !== 'choice') {
    throw new Error('Choice node not found or wrong type');
  }
  if (!endNode || endNode.type !== 'end') {
    throw new Error('End node not found or wrong type');
  }
  console.log('✅ All node types correct');

  // Verify positions
  if (
    !videoNode.metadata?.position ||
    videoNode.metadata.position.x !== 100 ||
    videoNode.metadata.position.y !== 100
  ) {
    throw new Error('Video node position incorrect');
  }
  console.log('✅ Node positions stored correctly');

  console.log('\n=== Test PASSED ===\n');

  // Cleanup
  sceneBuilderModule.clearDraft?.();
}

// Run test if executed directly
if (require.main === module) {
  try {
    testNodePaletteIntegration();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test FAILED:', error);
    process.exit(1);
  }
}

export { testNodePaletteIntegration };
