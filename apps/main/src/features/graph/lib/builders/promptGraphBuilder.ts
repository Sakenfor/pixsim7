/**
 * Prompt Candidate Graph Builder
 *
 * Utility functions to build PromptCandidateGraph from prompt analysis data.
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

import { getPromptRoleHex } from '@/lib/promptRoleUi';
import type {
  PromptBlockGraph,
  PromptGraphNode,
  PromptGraphEdge,
  PromptBlockCandidate,
  PromptSegmentRole,
} from '@/types/promptGraphs';

export interface BuildPromptGraphOptions {
  versionId?: string;
  promptTitle?: string;
  includeRoleGroups?: boolean;
}

/**
 * Build a PromptBlockGraph from parsed prompt candidates
 */
export function buildPromptCandidateGraph(
  candidates: PromptBlockCandidate[],
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

  // Create candidate nodes
  candidates.forEach((candidate, index) => {
    const candidateNodeId = `cand:${index}`;
    const truncatedText = candidate.text.length > 50
      ? candidate.text.substring(0, 50) + '...'
      : candidate.text;

    nodes.push({
      id: candidateNodeId,
      kind: 'candidate',
      label: truncatedText,
      role: candidate.role as PromptSegmentRole | undefined,
      versionId,
      candidateIndex: index,
      text: candidate.text,
    });

    // Add contains edge from prompt to candidate
    edges.push({
      id: `e-contains-${index}`,
      kind: 'contains',
      from: promptNodeId,
      to: candidateNodeId,
    });

    // Add next edge to previous candidate
    if (index > 0) {
      edges.push({
        id: `e-next-${index - 1}-${index}`,
        kind: 'next',
        from: `cand:${index - 1}`,
        to: candidateNodeId,
      });
    }

    // Track roles for role grouping
    if (includeRoleGroups && candidate.role) {
      roleGroups.add(candidate.role as PromptSegmentRole);
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

      // Add role-group edges to matching candidates
      candidates.forEach((candidate, index) => {
        if (candidate.role === role) {
          edges.push({
            id: `e-role-${role}-${index}`,
            kind: 'role-group',
            from: roleNodeId,
            to: `cand:${index}`,
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
  const promptRoleColors = usePromptSettingsStore.getState().promptRoleColors;
  return getPromptRoleHex(role, promptRoleColors);
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
