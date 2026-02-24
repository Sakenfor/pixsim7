/**
 * Generation Chain Types
 *
 * Types for the generation chain system — multi-step sequential generation
 * pipelines (e.g., txt2img → img2img refine → upscale).
 */

/** Guidance inheritance flags per step */
export interface GuidanceInheritFlags {
  references?: boolean;
  regions?: boolean;
  masks?: boolean;
  constraints?: boolean;
}

/** A single step definition within a chain */
export interface ChainStepDefinition {
  id: string;
  label?: string | null;
  template_id: string;
  operation?: string | null;
  input_from?: string | null;
  control_overrides?: Record<string, number> | null;
  character_binding_overrides?: Record<string, unknown> | null;
  guidance?: Record<string, unknown> | null;
  guidance_inherit?: GuidanceInheritFlags | null;
}

/** Summary view of a chain (for lists) */
export interface ChainSummary {
  id: string;
  name: string;
  description?: string | null;
  step_count: number;
  tags: string[];
  is_public: boolean;
  execution_count: number;
  created_at: string;
}

/** Full chain detail */
export interface ChainDetail {
  id: string;
  name: string;
  description?: string | null;
  steps: ChainStepDefinition[];
  tags: string[];
  chain_metadata: Record<string, unknown>;
  is_public: boolean;
  created_by?: string | null;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

/** Execution status */
export type ChainExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Per-step state within an execution */
export interface ChainStepState {
  step_id: string;
  status: string;
  generation_id?: number | null;
  asset_id?: number | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/** Chain execution record */
export interface ChainExecution {
  id: string;
  chain_id: string;
  status: ChainExecutionStatus;
  current_step_index: number;
  total_steps: number;
  step_states: ChainStepState[];
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}
