export type ResolverWorkbenchId = 'legacy_v1' | 'next_v1';

export interface ResolutionDebugOptions {
  include_trace?: boolean;
  include_candidate_scores?: boolean;
}

export interface ResolutionTarget {
  key: string;
  kind: string;
  label?: string | null;
  category?: string | null;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface ResolutionIntent {
  control_values?: Record<string, unknown>;
  desired_tags_by_target?: Record<string, Record<string, unknown>>;
  avoid_tags_by_target?: Record<string, Record<string, unknown>>;
  desired_features_by_target?: Record<string, Record<string, unknown>>;
  required_capabilities_by_target?: Record<string, string[]>;
  targets?: ResolutionTarget[];
}

export interface CandidateBlock {
  block_id: string;
  text: string;
  package_name?: string | null;
  tags?: Record<string, unknown>;
  category?: string | null;
  avg_rating?: number | null;
  features?: Record<string, unknown>;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface ResolutionConstraint {
  id: string;
  kind: string;
  target_key?: string | null;
  payload?: Record<string, unknown>;
  severity?: 'error' | 'warn' | string;
}

export interface PairwiseBonus {
  id: string;
  source_target: string;
  target_key: string;
  source_tags?: Record<string, unknown>;
  candidate_tags?: Record<string, unknown>;
  bonus?: number;
}

export interface TraceEvent {
  kind: string;
  target_key?: string | null;
  candidate_block_id?: string | null;
  score?: number | null;
  message?: string | null;
  data?: Record<string, unknown>;
}

export interface ResolutionTrace {
  events: TraceEvent[];
}

export interface SelectedBlock {
  target_key: string;
  block_id: string;
  text: string;
  score?: number | null;
  reasons?: string[];
  metadata?: Record<string, unknown>;
}

export interface ResolutionResult {
  resolver_id: string;
  seed?: number | null;
  selected_by_target: Record<string, SelectedBlock>;
  warnings?: string[];
  errors?: string[];
  trace?: ResolutionTrace;
  diagnostics?: Record<string, unknown>;
}

export interface ResolutionRequest {
  resolver_id: ResolverWorkbenchId | string;
  seed?: number | null;
  intent?: ResolutionIntent;
  candidates_by_target: Record<string, CandidateBlock[]>;
  constraints?: ResolutionConstraint[];
  pairwise_bonuses?: PairwiseBonus[];
  debug?: ResolutionDebugOptions;
  context?: Record<string, unknown>;
}

export interface ResolverWorkbenchFixture {
  id: string;
  name: string;
  description?: string;
  request: ResolutionRequest;
}

export interface ResolverWorkbenchSnapshot {
  resolution_schema_version: number;
  fixture_id?: string | null;
  request: ResolutionRequest;
  result?: ResolutionResult | null;
}
