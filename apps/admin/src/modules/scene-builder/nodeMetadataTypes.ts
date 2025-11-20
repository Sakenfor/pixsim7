/**
 * Type-safe node metadata structures
 * Defines specific metadata shapes for each node type
 */

/** Metadata for choice nodes */
export interface ChoiceNodeMetadata {
  choices?: Array<{
    id: string;
    text: string;
    color?: string;
  }>;
}

/** Metadata for scene call nodes */
export interface SceneCallNodeMetadata {
  returnPoints?: Array<{
    id: string;
    label?: string;
    color?: string;
    description?: string;
  }>;
}

/** Metadata for condition nodes */
export interface ConditionNodeMetadata {
  condition?: {
    key: string;
    op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'includes';
    value: any;
  };
}

/** Metadata for generation nodes */
export interface GenerationNodeMetadata {
  prompt?: string;
  provider?: string;
  model?: string;
}

/** Union type for all known metadata types */
export type NodeMetadata =
  | ChoiceNodeMetadata
  | SceneCallNodeMetadata
  | ConditionNodeMetadata
  | GenerationNodeMetadata
  | Record<string, any>; // Fallback for custom types
