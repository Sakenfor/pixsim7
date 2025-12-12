/**
 * Prompt Segment Graph Builder
 *
 * Utility functions to build PromptSegmentGraph from prompt analysis data.
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

import type {
  PromptBlockGraph,
  PromptGraphNode,
  PromptGraphEdge,
  PromptSegment,
  PromptSegmentRole,
} from '../../types/promptGraphs';

export interface BuildPromptGraphOptions {
  versionId?: string;
  promptTitle?: string;
  includeRoleGroups?: boolean;
}

/**
 * Build a PromptBlockGraph from parsed prompt segments
 */
export function buildPromptSegmentGraph(
  segments: PromptSegment[],
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
  const roleGroups = new Set<PromptSegmentRole>();

  // Create segment nodes
  segments.forEach((segment, index) => {
    const segmentNodeId = `seg:${index}`;
    const truncatedText = segment.text.length > 50
      ? segment.text.substring(0, 50) + '...'
      : segment.text;

    nodes.push({
      id: segmentNodeId,
      kind: 'segment',
      label: truncatedText,
      role: segment.role,
      versionId,
      segmentIndex: index,
      text: segment.text,
    });

    // Add contains edge from prompt to segment
    edges.push({
      id: `e-contains-${index}`,
      kind: 'contains',
      from: promptNodeId,
      to: segmentNodeId,
    });

    // Add next edge to previous segment
    if (index > 0) {
      edges.push({
        id: `e-next-${index - 1}-${index}`,
        kind: 'next',
        from: `seg:${index - 1}`,
        to: segmentNodeId,
      });
    }

    // Track roles for role grouping
    if (includeRoleGroups && segment.role) {
      roleGroups.add(segment.role);
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

      // Add role-group edges to matching segments
      segments.forEach((segment, index) => {
        if (segment.role === role) {
          edges.push({
            id: `e-role-${role}-${index}`,
            kind: 'role-group',
            from: roleNodeId,
            to: `seg:${index}`,
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
export function getNodeColorByRole(role?: PromptSegmentRole): string {
  if (!role) return '#94a3b8'; // neutral-400

  // Canonical role colors matching PromptSegmentRole
  const roleColors: Record<PromptSegmentRole, string> = {
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
