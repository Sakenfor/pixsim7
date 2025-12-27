import type { SceneCollection } from './types';
import type { ValidationIssue } from '../validation/types';

/**
 * Validate scene collection structure.
 *
 * Uses the shared ValidationIssue model so UI can render issues
 * from scenes, arcs, collections, and campaigns consistently.
 */
export function validateSceneCollection(
  collection: SceneCollection,
  sceneIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for missing scenes (hard errors)
  for (const scene of collection.scenes) {
    if (!sceneIds.has(scene.sceneId)) {
      issues.push({
        type: 'broken-scene-reference',
        severity: 'error',
        message: `Collection "${collection.title}" references non-existent scene: ${scene.sceneId}`,
        details: `Scene at order ${scene.order}`,
      });
    }
  }

  // Check for duplicate scene references (design warning)
  const seenScenes = new Set<string>();
  for (const scene of collection.scenes) {
    if (seenScenes.has(scene.sceneId)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'warning',
        message: `Collection "${collection.title}" contains duplicate scene: ${scene.sceneId}`,
      });
    }
    seenScenes.add(scene.sceneId);
  }

  // Check for ordering gaps (informational only)
  const orders = collection.scenes.map(s => s.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length - 1; i++) {
    if (orders[i + 1] - orders[i] > 1) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'info',
        message: `Collection "${collection.title}" has ordering gap between ${orders[i]} and ${orders[i + 1]}`,
      });
    }
  }

  // Warn if collection is empty
  if (collection.scenes.length === 0) {
    issues.push({
      type: 'no-nodes',
      severity: 'warning',
      message: `Collection "${collection.title}" contains no scenes`,
    });
  }

  return issues;
}
