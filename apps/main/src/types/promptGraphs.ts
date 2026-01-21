/**
 * Prompt & Action Block Graph Types
 *
 * Dev-only graph visualization types for:
 * - Prompt Segment Graph: Visualizes parsed prompt structure
 * - Action Block Graph: Visualizes ActionBlocks and their relationships
 *
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

// Re-export prompt types from canonical source
export type { PromptSegment, PromptSegmentRole, PromptParseResult } from '@pixsim7/shared.types/prompt';
import type { PromptSegmentRole } from '@pixsim7/shared.types/prompt';

// ===== Prompt Segment Graph Types =====

export type PromptGraphNodeKind = 'prompt' | 'segment' | 'role';
export type PromptGraphEdgeKind = 'next' | 'contains' | 'role-group';

export interface PromptGraphNode {
  id: string;                     // e.g., "prompt:{versionId}", "seg:{idx}", "role:action"
  kind: PromptGraphNodeKind;
  label: string;                  // short label for node
  role?: PromptSegmentRole;       // for segment nodes (character/action/setting/...)
  versionId?: string;             // prompt version UUID (for prompt/segment nodes)
  segmentIndex?: number;          // for segment nodes
  text?: string;                  // full text for tooltips
}

export interface PromptGraphEdge {
  id: string;                     // e.g., "e-next-0-1"
  kind: PromptGraphEdgeKind;
  from: string;
  to: string;
}

export interface PromptBlockGraph {
  nodes: PromptGraphNode[];
  edges: PromptGraphEdge[];
}

// ===== Action Block Graph Types =====

export type ActionGraphNodeKind = 'block' | 'package' | 'prompt-version';
export type ActionGraphEdgeKind = 'can-follow' | 'composed-of' | 'extracted-from';

export interface ActionGraphNode {
  id: string;                     // e.g., "ab:{uuid}", "pkg:{name}", "pv:{versionId}"
  kind: ActionGraphNodeKind;
  label: string;
  packageName?: string;           // for block nodes
  complexity?: string;            // simple/moderate/complex/very_complex
  blockId?: string;               // ActionBlock UUID
  isComposite?: boolean;          // true if this is a composite block
}

export interface ActionGraphEdge {
  id: string;
  kind: ActionGraphEdgeKind;
  from: string;
  to: string;
}

export interface ActionBlockGraph {
  nodes: ActionGraphNode[];
  edges: ActionGraphEdge[];
}

// ===== Helper Types =====

export interface ActionBlock {
  id: string;
  block_id: string;
  package_name: string;
  prompt: string;
  tags: string[];
  compatible_next: string[];
  compatible_prev: string[];
  complexity_level: string;
  source_type: string;
  is_composite: boolean;
  component_blocks?: string[];
  composition_strategy?: string;
  prompt_version_id?: string;
  extracted_from_prompt_version?: string;
}
