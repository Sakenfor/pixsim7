/**
 * Scene Graph Validation
 *
 * Validates scene graphs and detects common issues:
 * - Missing start node
 * - Unreachable nodes
 * - Dead ends (nodes with no outgoing edges)
 * - Cycles (circular paths)
 * - Empty media/content
 * - Invalid configurations
 */

import type { DraftScene } from './index';

export type ValidationIssueType =
  | 'missing-start'
  | 'unreachable'
  | 'dead-end'
  | 'cycle'
  | 'empty-media'
  | 'invalid-selection'
  | 'no-nodes';

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  details?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Validate a draft scene and return all issues
 */
export function validateScene(draft: DraftScene | undefined | null): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!draft) {
    return {
      valid: true,
      issues: [],
      errors: [],
      warnings: [],
    };
  }

  // Check: No nodes
  if (draft.nodes.length === 0) {
    issues.push({
      type: 'no-nodes',
      severity: 'warning',
      message: 'Scene has no nodes',
      details: 'Add nodes from the palette to build your scene',
    });
  }

  // Check: Missing start node
  if (draft.nodes.length > 0 && !draft.startNodeId) {
    issues.push({
      type: 'missing-start',
      severity: 'error',
      message: 'No start node set',
      details: 'Select a node and click "Set Start" to define the entry point',
    });
  }

  // Check: Start node doesn't exist
  if (draft.startNodeId && !draft.nodes.find((n) => n.id === draft.startNodeId)) {
    issues.push({
      type: 'missing-start',
      severity: 'error',
      message: 'Start node not found',
      nodeId: draft.startNodeId,
      details: `Node "${draft.startNodeId}" is set as start but doesn't exist`,
    });
  }

  // Check: Unreachable nodes
  if (draft.startNodeId && draft.nodes.length > 1) {
    const reachable = getReachableNodes(draft);
    draft.nodes.forEach((node) => {
      if (!reachable.has(node.id)) {
        issues.push({
          type: 'unreachable',
          severity: 'warning',
          message: `Node "${node.metadata?.label || node.id}" is unreachable`,
          nodeId: node.id,
          details: 'No path exists from the start node to this node',
        });
      }
    });
  }

  // Check: Dead ends (nodes with no outgoing edges, excluding End nodes)
  draft.nodes.forEach((node) => {
    if (node.type === 'end') return; // End nodes are supposed to have no outgoing edges

    const hasOutgoingEdges =
      (draft.edges || []).some((e) => e.from === node.id) ||
      (node.connections || []).length > 0;

    if (!hasOutgoingEdges) {
      issues.push({
        type: 'dead-end',
        severity: 'warning',
        message: `Node "${node.metadata?.label || node.id}" has no outgoing edges`,
        nodeId: node.id,
        details: 'Connect this node to other nodes or change its type to "end"',
      });
    }
  });

  // Check: Cycles (optional - some games may want cycles)
  const cycles = detectCycles(draft);
  if (cycles.length > 0) {
    cycles.forEach((cycle) => {
      issues.push({
        type: 'cycle',
        severity: 'info',
        message: `Cycle detected: ${cycle.map((id) => draft.nodes.find((n) => n.id === id)?.metadata?.label || id).join(' → ')}`,
        nodeId: cycle[0],
        details: 'Circular paths can cause infinite loops if not handled carefully',
      });
    });
  }

  // Check: Video nodes with empty media
  draft.nodes.forEach((node) => {
    if (node.type === 'video') {
      const hasMedia = node.segments && node.segments.length > 0;
      const hasAssets = node.assetIds && node.assetIds.length > 0;

      if (!hasMedia && !hasAssets) {
        issues.push({
          type: 'empty-media',
          severity: 'warning',
          message: `Video node "${node.metadata?.label || node.id}" has no media`,
          nodeId: node.id,
          details: 'Add video segments or assets to this node',
        });
      }
    }
  });

  // Check: Invalid selections
  draft.nodes.forEach((node) => {
    if (node.type === 'video' && node.selection?.kind === 'pool') {
      if (!node.selection.filterTags || node.selection.filterTags.length === 0) {
        issues.push({
          type: 'invalid-selection',
          severity: 'warning',
          message: `Node "${node.metadata?.label || node.id}" uses pool selection without tags`,
          nodeId: node.id,
          details: 'Add filter tags or change selection strategy',
        });
      }
    }
  });

  // Categorize issues
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}

/**
 * Get all nodes reachable from the start node
 */
function getReachableNodes(draft: DraftScene): Set<string> {
  const reachable = new Set<string>();
  const visited = new Set<string>();

  if (!draft.startNodeId) return reachable;

  const queue = [draft.startNodeId];
  visited.add(draft.startNodeId);
  reachable.add(draft.startNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = draft.nodes.find((n) => n.id === current);
    if (!node) continue;

    // Get outgoing edges
    const targets = new Set<string>();

    // From draft.edges
    (draft.edges || []).forEach((edge) => {
      if (edge.from === current) {
        targets.add(edge.to);
      }
    });

    // From node.connections (legacy)
    (node.connections || []).forEach((targetId) => {
      targets.add(targetId);
    });

    // Visit each target
    targets.forEach((targetId) => {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        reachable.add(targetId);
        queue.push(targetId);
      }
    });
  }

  return reachable;
}

/**
 * Detect cycles in the graph using DFS
 */
function detectCycles(draft: DraftScene): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = draft.nodes.find((n) => n.id === nodeId);
    if (!node) {
      path.pop();
      recursionStack.delete(nodeId);
      return;
    }

    // Get all targets
    const targets = new Set<string>();
    (draft.edges || []).forEach((edge) => {
      if (edge.from === nodeId) targets.add(edge.to);
    });
    (node.connections || []).forEach((targetId) => targets.add(targetId));

    for (const targetId of targets) {
      if (!visited.has(targetId)) {
        dfs(targetId);
      } else if (recursionStack.has(targetId)) {
        // Found a cycle
        const cycleStart = path.indexOf(targetId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), targetId]);
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
  }

  draft.nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  });

  return cycles;
}

/**
 * Quick validation checks for common issues
 */
export function hasErrors(draft: DraftScene | undefined): boolean {
  return validateScene(draft).errors.length > 0;
}

export function hasWarnings(draft: DraftScene | undefined): boolean {
  return validateScene(draft).warnings.length > 0;
}

export function hasIssues(draft: DraftScene | undefined): boolean {
  return validateScene(draft).issues.length > 0;
}
