/**
 * Action Block Graph Builder
 *
 * Utility functions to build ActionBlockGraph from ActionBlock data.
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

import type {
  ActionBlockGraph,
  ActionGraphNode,
  ActionGraphEdge,
  ActionBlock,
} from '../../types/promptGraphs';

export interface BuildActionGraphOptions {
  includePackages?: boolean;
  includePromptVersions?: boolean;
  layoutByPackage?: boolean;
}

/**
 * Build an ActionBlockGraph from ActionBlock data
 */
export function buildActionBlockGraph(
  blocks: ActionBlock[],
  options: BuildActionGraphOptions = {}
): ActionBlockGraph {
  const {
    includePackages = true,
    includePromptVersions = false,
  } = options;

  const nodes: ActionGraphNode[] = [];
  const edges: ActionGraphEdge[] = [];

  // Track packages and prompt versions
  const packages = new Set<string>();
  const promptVersions = new Set<string>();

  // Map block_id to node id for edge creation
  const blockIdToNodeId = new Map<string, string>();

  // Create block nodes
  blocks.forEach((block) => {
    const nodeId = `ab:${block.id}`;
    blockIdToNodeId.set(block.block_id, nodeId);

    nodes.push({
      id: nodeId,
      kind: 'block',
      label: block.block_id,
      packageName: block.package_name,
      complexity: block.complexity_level,
      blockId: block.id,
      isComposite: block.is_composite,
    });

    // Track packages
    if (includePackages && block.package_name) {
      packages.add(block.package_name);
    }

    // Track prompt versions
    if (includePromptVersions && block.extracted_from_prompt_version) {
      promptVersions.add(block.extracted_from_prompt_version);
    }
  });

  // Create package nodes
  if (includePackages) {
    packages.forEach((packageName) => {
      const pkgNodeId = `pkg:${packageName}`;
      nodes.push({
        id: pkgNodeId,
        kind: 'package',
        label: packageName,
        packageName,
      });

      // Add edges from package to blocks
      blocks.forEach((block) => {
        if (block.package_name === packageName) {
          edges.push({
            id: `e-pkg-${packageName}-${block.id}`,
            kind: 'composed-of',
            from: pkgNodeId,
            to: `ab:${block.id}`,
          });
        }
      });
    });
  }

  // Create prompt version nodes
  if (includePromptVersions) {
    promptVersions.forEach((versionId) => {
      const pvNodeId = `pv:${versionId}`;
      nodes.push({
        id: pvNodeId,
        kind: 'prompt-version',
        label: `Version ${versionId.substring(0, 8)}...`,
      });

      // Add edges from prompt version to blocks
      blocks.forEach((block) => {
        if (block.extracted_from_prompt_version === versionId) {
          edges.push({
            id: `e-pv-${versionId}-${block.id}`,
            kind: 'extracted-from',
            from: pvNodeId,
            to: `ab:${block.id}`,
          });
        }
      });
    });
  }

  // Create compatibility edges (can-follow)
  blocks.forEach((block) => {
    if (block.compatible_next && block.compatible_next.length > 0) {
      block.compatible_next.forEach((nextBlockId) => {
        const fromNodeId = `ab:${block.id}`;
        const toNodeId = blockIdToNodeId.get(nextBlockId);

        if (toNodeId) {
          edges.push({
            id: `e-next-${block.id}-${nextBlockId}`,
            kind: 'can-follow',
            from: fromNodeId,
            to: toNodeId,
          });
        }
      });
    }
  });

  // Create composition edges (for composite blocks)
  blocks.forEach((block) => {
    if (block.is_composite && block.component_blocks && block.component_blocks.length > 0) {
      block.component_blocks.forEach((componentBlockId) => {
        const fromNodeId = `ab:${block.id}`;
        const toNodeId = blockIdToNodeId.get(componentBlockId);

        if (toNodeId) {
          edges.push({
            id: `e-composite-${block.id}-${componentBlockId}`,
            kind: 'composed-of',
            from: fromNodeId,
            to: toNodeId,
          });
        }
      });
    }
  });

  return { nodes, edges };
}

/**
 * Get node color based on complexity
 */
export function getNodeColorByComplexity(complexity?: string): string {
  if (!complexity) return '#94a3b8'; // neutral-400

  const complexityColors: Record<string, string> = {
    simple: '#10b981',       // green-500
    moderate: '#3b82f6',     // blue-500
    complex: '#f59e0b',      // amber-500
    very_complex: '#ef4444', // red-500
  };

  return complexityColors[complexity.toLowerCase()] || '#64748b'; // slate-500
}

/**
 * Get node style for composite blocks
 */
export function getCompositeNodeStyle(isComposite?: boolean): { borderWidth: number; borderStyle: string } {
  return isComposite
    ? { borderWidth: 3, borderStyle: 'double' }
    : { borderWidth: 2, borderStyle: 'solid' };
}

/**
 * Get edge style based on edge kind
 */
export function getActionEdgeStyle(kind: string): { color: string; width: number; dashed?: boolean } {
  switch (kind) {
    case 'can-follow':
      return { color: '#3b82f6', width: 2 }; // blue-500
    case 'composed-of':
      return { color: '#8b5cf6', width: 2, dashed: true }; // violet-500 dashed
    case 'extracted-from':
      return { color: '#06b6d4', width: 1, dashed: true }; // cyan-500 dashed
    default:
      return { color: '#94a3b8', width: 2 };
  }
}
