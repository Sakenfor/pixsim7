/**
 * Prompt Block Graph Builder
 *
 * Utility functions to build PromptBlockGraph from prompt analysis data.
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

import type {
  PromptBlockGraph,
  PromptGraphNode,
  PromptGraphEdge,
  PromptBlock,
  PromptBlockRole,
} from '../../types/promptGraphs';

export interface BuildPromptGraphOptions {
  versionId?: string;
  promptTitle?: string;
  includeRoleGroups?: boolean;
}

/**
 * Build a PromptBlockGraph from parsed prompt blocks
 */
export function buildPromptBlockGraph(
  blocks: PromptBlock[],
  options: BuildPromptGraphOptions = {}
): PromptBlockGraph {
  const {
    versionId = 'unknown',
    promptTitle = 'Prompt',
    includeRoleGroups = false,
  } = options;

  const nodes: PromptGraphNode[] = [];
  const edges: PromptGraphEdge[] = [];

  // Create prompt node
  const promptNodeId = `prompt:${versionId}`;
  nodes.push({
    id: promptNodeId,
    kind: 'prompt',
    label: promptTitle,
    versionId,
  });

  // Track role groups if enabled
  const roleGroups = new Set<string>();

  // Create block nodes
  blocks.forEach((block, index) => {
    const blockNodeId = `block:${index}`;
    const truncatedText = block.text.length > 50
      ? block.text.substring(0, 50) + '...'
      : block.text;

    nodes.push({
      id: blockNodeId,
      kind: 'block',
      label: truncatedText,
      role: block.role,
      versionId,
      blockIndex: index,
      text: block.text,
    });

    // Add contains edge from prompt to block
    edges.push({
      id: `e-contains-${index}`,
      kind: 'contains',
      from: promptNodeId,
      to: blockNodeId,
    });

    // Add next edge to previous block
    if (index > 0) {
      edges.push({
        id: `e-next-${index - 1}-${index}`,
        kind: 'next',
        from: `block:${index - 1}`,
        to: blockNodeId,
      });
    }

    // Track roles for role grouping
    if (includeRoleGroups && block.role) {
      roleGroups.add(block.role);
    }
  });

  // Create role group nodes if enabled
  if (includeRoleGroups) {
    roleGroups.forEach((role) => {
      const roleNodeId = `role:${role}`;
      nodes.push({
        id: roleNodeId,
        kind: 'role',
        label: role,
        role,
      });

      // Add role-group edges to matching blocks
      blocks.forEach((block, index) => {
        if (block.role === role) {
          edges.push({
            id: `e-role-${role}-${index}`,
            kind: 'role-group',
            from: roleNodeId,
            to: `block:${index}`,
          });
        }
      });
    });
  }

  return { nodes, edges };
}

/**
 * Get node color based on role
 */
export function getNodeColorByRole(role?: PromptBlockRole): string {
  if (!role) return '#94a3b8'; // neutral-400

  // Canonical role colors matching PromptBlockRole
  const roleColors: Record<PromptBlockRole, string> = {
    character: '#3b82f6', // blue-500
    action: '#10b981',    // green-500
    setting: '#a855f7',   // purple-500
    mood: '#eab308',      // yellow-500
    romance: '#ec4899',   // pink-500
    other: '#64748b',     // slate-500
  };

  return roleColors[role];
}

/**
 * Get edge style based on edge kind
 */
export function getEdgeStyle(kind: string): { color: string; width: number; dashed?: boolean } {
  switch (kind) {
    case 'contains':
      return { color: '#cbd5e1', width: 2 }; // slate-300
    case 'next':
      return { color: '#3b82f6', width: 3 }; // blue-500
    case 'role-group':
      return { color: '#94a3b8', width: 1, dashed: true }; // neutral-400 dashed
    default:
      return { color: '#94a3b8', width: 2 };
  }
}
