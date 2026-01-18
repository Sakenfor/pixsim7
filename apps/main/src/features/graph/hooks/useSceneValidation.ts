/**
 * Scene Validation Hook
 *
 * Provides memoized, indexed validation results for the current scene.
 * Validation is computed once per scene change and indexed by nodeId for O(1) lookups.
 *
 * Performance optimization:
 * - Before: Each SceneNode ran validateScene() independently = O(n²) total
 * - After: Validation runs once, nodes do O(1) map lookup
 */

import { useMemo } from 'react';

import type { DraftScene } from '@domain/sceneBuilder';
import { validateScene, type ValidationIssue, type ValidationResult } from '@domain/sceneBuilder/validation';

export interface IndexedValidationResult extends ValidationResult {
  /** Issues indexed by nodeId for O(1) lookup */
  byNodeId: Map<string, ValidationIssue[]>;
  /** Issues not associated with any specific node */
  sceneLevel: ValidationIssue[];
}

/**
 * Compute validation results with node-indexed lookup
 */
function createIndexedValidation(scene: DraftScene | null): IndexedValidationResult {
  if (!scene) {
    return {
      valid: true,
      issues: [],
      errors: [],
      warnings: [],
      byNodeId: new Map(),
      sceneLevel: [],
    };
  }

  const result = validateScene(scene);
  const byNodeId = new Map<string, ValidationIssue[]>();
  const sceneLevel: ValidationIssue[] = [];

  for (const issue of result.issues) {
    if (issue.nodeId) {
      const existing = byNodeId.get(issue.nodeId);
      if (existing) {
        existing.push(issue);
      } else {
        byNodeId.set(issue.nodeId, [issue]);
      }
    } else {
      sceneLevel.push(issue);
    }
  }

  return {
    ...result,
    byNodeId,
    sceneLevel,
  };
}

/**
 * Hook to get indexed validation results for the current scene.
 * Memoized so validation only runs when the scene changes.
 */
export function useSceneValidation(scene: DraftScene | null): IndexedValidationResult {
  return useMemo(() => createIndexedValidation(scene), [scene]);
}

/**
 * Hook to get validation issues for a specific node.
 * Uses the indexed result for O(1) lookup.
 */
export function useNodeValidation(
  validation: IndexedValidationResult,
  nodeId: string
): {
  issues: ValidationIssue[];
  highestSeverity: 'error' | 'warning' | 'info' | null;
} {
  return useMemo(() => {
    const issues = validation.byNodeId.get(nodeId) || [];

    let highestSeverity: 'error' | 'warning' | 'info' | null = null;
    for (const issue of issues) {
      if (issue.severity === 'error') {
        highestSeverity = 'error';
        break; // error is highest, no need to continue
      }
      if (issue.severity === 'warning' && highestSeverity !== 'error') {
        highestSeverity = 'warning';
      }
      if (issue.severity === 'info' && !highestSeverity) {
        highestSeverity = 'info';
      }
    }

    return { issues, highestSeverity };
  }, [validation, nodeId]);
}
