/**
 * Arc Graph Validation
 *
 * Provides comprehensive validation for arc graphs including:
 * - Cross-layer reference validation (scene references)
 * - Structural validation (reachability, cycles, dead ends)
 * - Semantic validation (requirements, dependencies)
 *
 * Design principles:
 * - Dependencies are derived, not stored (maintains single source of truth)
 * - Structural issues are warnings (may be intentional design)
 * - Broken references are errors (data integrity issues)
 * - Minimal coupling (accepts sceneIds as Set, not entire store)
 */

import type {
  ValidationIssue,
  ValidationResult,
  ArcValidationIssueType,
} from '@domain/validation/types';

import type { ArcGraph } from './types';

/**
 * Validate arc graph scene references against available scenes.
 *
 * This function checks if sceneId references in arc nodes point to
 * valid scenes in the scene graph store. Broken references are reported
 * as errors since they represent data integrity issues.
 *
 * @param arcGraph - The arc graph to validate
 * @param sceneIds - Set of valid scene IDs (from graphStore)
 * @param worldId - Optional world ID for world-scoped validation
 * @returns Validation issues for broken scene references
 */
export function validateArcGraphReferences(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  worldId?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of arcGraph.nodes) {
    // Check scene reference (all node types except arc_group can have sceneId)
    if (node.type !== 'arc_group' && node.sceneId) {
      if (!sceneIds.has(node.sceneId)) {
        issues.push({
          type: 'broken-scene-reference' as ArcValidationIssueType,
          severity: 'error',
          message: `${node.type} node "${node.label}" references non-existent scene: ${node.sceneId}`,
          nodeId: node.id,
          details: worldId ? `Scene not found in world: ${worldId}` : undefined,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate arc graph structure (reachability, cycles, dead ends).
 *
 * This function performs structural analysis of the arc graph to detect
 * common graph issues. Note that most structural issues are reported as
 * warnings rather than errors, since they may be intentional design patterns:
 * - Unreachable nodes: May represent conditional unlocks
 * - Dead ends: May represent story endpoints
 * - Cycles: May represent repeatable quests
 *
 * @param arcGraph - The arc graph to validate
 * @returns Validation issues for structural problems
 */
export function validateArcGraphStructure(
  arcGraph: ArcGraph
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for missing start node (ERROR)
  if (!arcGraph.startNodeId) {
    issues.push({
      type: 'missing-start' as ArcValidationIssueType,
      severity: 'error',
      message: 'Arc graph has no start node',
    });
    return issues; // Can't validate reachability without start
  }

  if (!arcGraph.nodes.some(n => n.id === arcGraph.startNodeId)) {
    issues.push({
      type: 'missing-start' as ArcValidationIssueType,
      severity: 'error',
      message: `Start node ${arcGraph.startNodeId} does not exist`,
    });
    return issues;
  }

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const edge of arcGraph.edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge.to);
  }

  // Check for unreachable nodes (WARNING - may be intentional)
  const reachable = new Set<string>();
  const queue = [arcGraph.startNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    const neighbors = adjacency.get(nodeId) || [];
    queue.push(...neighbors);
  }

  for (const node of arcGraph.nodes) {
    if (!reachable.has(node.id) && node.id !== arcGraph.startNodeId) {
      issues.push({
        type: 'unreachable' as ArcValidationIssueType,
        severity: 'warning',
        message: `${node.type} node "${node.label}" is unreachable from start`,
        nodeId: node.id,
        details: 'This may be intentional (e.g., conditional arc unlocks)',
      });
    }
  }

  // Check for dead ends (WARNING - may be intentional)
  for (const node of arcGraph.nodes) {
    const outgoing = adjacency.get(node.id) || [];
    if (outgoing.length === 0 && node.type !== 'milestone') {
      issues.push({
        type: 'dead-end' as ArcValidationIssueType,
        severity: 'warning',
        message: `${node.type} node "${node.label}" has no outgoing edges`,
        nodeId: node.id,
        details: 'This may be intentional (e.g., story endpoint)',
      });
    }
  }

  // Check for cycles (WARNING - may be intentional)
  const visited = new Set<string>();
  const stack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    stack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (hasCycle(neighbor)) return true;
    }

    stack.delete(nodeId);
    return false;
  }

  for (const node of arcGraph.nodes) {
    if (hasCycle(node.id)) {
      issues.push({
        type: 'cycle' as ArcValidationIssueType,
        severity: 'warning',
        message: `Cycle detected involving ${node.type} node "${node.label}"`,
        nodeId: node.id,
        details: 'Cycles may be valid (e.g., repeatable quests)',
      });
      break; // Report once
    }
  }

  return issues;
}

/**
 * Comprehensive arc graph validation.
 *
 * This function combines all validation checks:
 * 1. Structural validation (duplicate IDs, invalid edges)
 * 2. Cross-layer reference validation (broken scene references)
 * 3. Graph structure validation (reachability, cycles, dead ends)
 * 4. Optional quest/character reference validation
 *
 * @param arcGraph - The arc graph to validate
 * @param sceneIds - Set of valid scene IDs
 * @param options - Optional validation configuration
 * @returns Comprehensive validation result
 */
export function validateArcGraph(
  arcGraph: ArcGraph,
  sceneIds: Set<string>,
  options?: {
    worldId?: string;
    validateQuests?: boolean;
    validateCharacters?: boolean;
    questIds?: Set<string>;
    characterIds?: Set<string>;
  }
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Structural validation: duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of arcGraph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        type: 'invalid-requirements' as ArcValidationIssueType,
        severity: 'error',
        message: `Duplicate node ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  // Structural validation: duplicate edge IDs
  const edgeIds = new Set<string>();
  for (const edge of arcGraph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        type: 'invalid-requirements' as ArcValidationIssueType,
        severity: 'error',
        message: `Duplicate edge ID: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);
  }

  // Structural validation: invalid edge references
  for (const edge of arcGraph.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        type: 'invalid-requirements' as ArcValidationIssueType,
        severity: 'error',
        message: `Edge ${edge.id} references non-existent source node: ${edge.from}`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        type: 'invalid-requirements' as ArcValidationIssueType,
        severity: 'error',
        message: `Edge ${edge.id} references non-existent target node: ${edge.to}`,
      });
    }
  }

  // Cross-layer reference validation
  issues.push(...validateArcGraphReferences(arcGraph, sceneIds, options?.worldId));

  // Structure validation (reachability, cycles, dead ends)
  issues.push(...validateArcGraphStructure(arcGraph));

  // Optional: Quest reference validation
  if (options?.validateQuests && options.questIds) {
    for (const node of arcGraph.nodes) {
      if (node.type === 'quest' && !options.questIds.has(node.id)) {
        issues.push({
          type: 'broken-quest-reference' as ArcValidationIssueType,
          severity: 'warning',
          message: `Quest node references undefined quest: ${node.id}`,
          nodeId: node.id,
        });
      }
    }
  }

  // Optional: Character reference validation
  if (options?.validateCharacters && options.characterIds) {
    for (const node of arcGraph.nodes) {
      // Check relationship requirements
      if ('relationshipRequirements' in node && node.relationshipRequirements) {
        for (const req of node.relationshipRequirements) {
          if (!options.characterIds.has(req.characterId)) {
            issues.push({
              type: 'broken-character-reference' as ArcValidationIssueType,
              severity: 'warning',
              message: `Node "${node.label}" references non-existent character: ${req.characterId}`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}
