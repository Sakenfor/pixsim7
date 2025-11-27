/**
 * Prompt & Action Block Graph Types
 *
 * Dev-only graph visualization types for:
 * - Prompt Block Graph: Visualizes parsed prompt structure
 * - Action Block Graph: Visualizes ActionBlocks and their relationships
 *
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

// ===== Prompt Block Graph Types =====

export type PromptGraphNodeKind = 'prompt' | 'block' | 'role';
export type PromptGraphEdgeKind = 'next' | 'contains' | 'role-group';

export interface PromptGraphNode {
  id: string;                     // e.g., "prompt:{versionId}", "block:{idx}", "role:action"
  kind: PromptGraphNodeKind;
  label: string;                  // short label for node
  role?: string;                  // for block nodes (character/action/setting/...)
  versionId?: string;             // prompt version UUID (for prompt/block nodes)
  blockIndex?: number;            // for block nodes
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

export interface PromptBlock {
  role: string;
  text: string;
  component_type?: string;
}

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
