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
  prompt?: string | null;
  repeat_count?: number | null;
  provider_id?: string | null;
  preferred_account_id?: number | null;
  inherit_previous_settings?: boolean | null;
  params_overrides?: Record<string, unknown> | null;
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

export interface ExecutionPolicyV1 {
  version: 1;
  dispatch_mode: 'single' | 'fanout' | 'sequential';
  wait_policy: 'none' | 'terminal_per_step' | 'terminal_final';
  dependency_mode: 'none' | 'previous' | 'explicit';
  failure_policy: 'stop' | 'continue';
  concurrency: number;
  step_timeout_seconds?: number;
  force_new?: boolean;
}

/** Chain execution record */
export interface ChainExecution {
  id: string;
  chain_id: string;
  status: ChainExecutionStatus;
  current_step_index: number;
  total_steps: number;
  step_states: ChainStepState[];
  execution_policy?: ExecutionPolicyV1 | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}
