export type FlowGraphVersion = '1.0.0';

export type FlowDomain = 'scene' | 'character' | 'generation' | 'world' | 'asset';

export type FlowNodeKind = 'panel' | 'action' | 'api' | 'job' | 'artifact' | 'gate';

export type FlowRunStatus = 'in_progress' | 'completed' | 'blocked' | 'abandoned';

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  label: string;
  ref?: string;
  required_caps?: string[];
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  condition?: string;
  on_fail_reason?: string;
}

export interface FlowTemplate {
  id: string;
  label: string;
  domain: FlowDomain;
  start_node_id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[];
}

export interface FlowRunSummary {
  template_id: string;
  started_at: string;
  ended_at?: string;
  status: FlowRunStatus;
  last_node_id?: string;
}

export interface FlowGraphV1 {
  version: FlowGraphVersion;
  generated_at: string;
  templates: FlowTemplate[];
  runs: FlowRunSummary[];
  metrics: {
    total_templates: number;
    total_runs: number;
    blocked_edges_24h: number;
  };
}

export interface FlowResolveContext {
  project_id?: string;
  world_id?: string;
  location_id?: string;
  active_character_id?: string;
  capabilities?: string[];
  flags?: string[];
}

export interface FlowResolveRequest {
  goal: string;
  context?: FlowResolveContext;
}

export interface FlowCandidateTemplate {
  id: string;
  kind: 'candidate_template';
  template_id: string;
  label: string;
  domain: FlowDomain;
  status: 'ready' | 'blocked';
  progressed_node_ids: string[];
  reason_code?: string;
  reason?: string;
  blocked_reason_code?: string;
  blocked_reason?: string;
}

export interface FlowNextStep {
  id: string;
  template_id: string;
  node_id: string;
  label: string;
  kind: FlowNodeKind;
  ref?: string;
}

export interface FlowBlockedStep {
  id: string;
  kind: 'blocked_step';
  template_id: string;
  edge_id: string;
  node_id: string;
  label: string;
  reason_code: string;
  reason: string;
}

export interface FlowSuggestedPath {
  id: string;
  kind: 'suggested_path';
  template_id: string;
  node_ids: string[];
  blocked: boolean;
  reason_code?: string;
  reason?: string;
  blocked_reason_code?: string;
  blocked_reason?: string;
}

export interface FlowResolveResponse {
  version: FlowGraphVersion;
  generated_at: string;
  goal: string;
  candidate_templates: FlowCandidateTemplate[];
  next_steps: FlowNextStep[];
  blocked_steps: FlowBlockedStep[];
  suggested_path?: FlowSuggestedPath;
}

export interface FlowTraceRequest {
  template_id: string;
  run_id?: string;
  node_id: string;
  status: FlowRunStatus;
  reason_code?: string;
  reason?: string;
  occurred_at?: string;
}

export interface FlowTraceResponse {
  accepted: true;
  template_id: string;
  run_id: string;
  run_summary: FlowRunSummary;
  blocked_edges_24h: number;
}
