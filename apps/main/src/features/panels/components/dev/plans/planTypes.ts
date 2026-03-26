/**
 * Type definitions for the Plans panel system.
 *
 * Extracted from PlansPanel.tsx for reuse across plan sub-components.
 */

import type { Checkpoint } from './PlanCheckpointList';

// Re-export so consumers can import Checkpoint from here too
export type { Checkpoint };

// ---------------------------------------------------------------------------
// Plan core types
// ---------------------------------------------------------------------------

export interface PlanTarget {
  type: string;
  id: string;
  description: string;
  paths?: string[];
}

export interface PlanChildSummary {
  id: string;
  title: string;
  status: string;
  stage: string;
  priority: string;
}

export interface PlanSummary {
  id: string;
  documentId: string | null;
  parentId: string | null;
  title: string;
  status: string;
  stage: string;
  owner: string;
  lastUpdated: string;
  priority: string;
  summary: string;
  scope: string;
  planType: string;
  visibility: string;
  target: PlanTarget | null;
  checkpoints: Checkpoint[] | null;
  codePaths: string[];
  companions: string[];
  handoffs: string[];
  tags: string[];
  dependsOn: string[];
  revision?: number | null;
  reviewRoundCount?: number;
  activeReviewRoundCount?: number;
  children: PlanChildSummary[];
}

export interface PlanDetail extends PlanSummary {
  planPath: string;
  markdown: string;
}

export interface PlansIndexResponse {
  version: string;
  generatedAt: string | null;
  plans: PlanSummary[];
}

export interface PlanUpdateResponse {
  planId: string;
  changes: { field: string; old: string; new: string }[];
  revision: number | null;
  commitSha: string | null;
  newScope: string | null;
}

// ---------------------------------------------------------------------------
// Stage options
// ---------------------------------------------------------------------------

export interface PlanStageOptionEntry {
  value: string;
  label: string;
  description: string;
  aliases: string[];
}

export interface PlanStagesResponse {
  defaultStage: string;
  stages: PlanStageOptionEntry[];
}

// ---------------------------------------------------------------------------
// Review types
// ---------------------------------------------------------------------------

export type ReviewRoundStatus = 'open' | 'changes_requested' | 'approved' | 'concluded';
export type ReviewNodeKind = 'review_comment' | 'agent_response' | 'conclusion' | 'note';
export type ReviewAuthorRole = 'reviewer' | 'author' | 'agent' | 'system';
export type ReviewRequestStatus = 'open' | 'in_progress' | 'fulfilled' | 'cancelled';
export type ReviewRequestQueuePolicy = 'start_now' | 'queue_next' | 'auto_reroute';
export type ReviewRequestMode = 'review_only' | 'propose_patch' | 'apply_patch';

export interface PlanReviewRound {
  id: string;
  planId: string;
  roundNumber: number;
  reviewRevision: number | null;
  status: ReviewRoundStatus;
  note: string | null;
  conclusion: string | null;
  createdBy: string | null;
  actorPrincipalType: 'user' | 'agent' | 'service' | null;
  actorAgentId: string | null;
  actorRunId: string | null;
  actorUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanReviewNode {
  id: string;
  planId: string;
  roundId: string;
  kind: ReviewNodeKind;
  authorRole: ReviewAuthorRole;
  body: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | null;
  planAnchor: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdBy: string | null;
  actorPrincipalType: 'user' | 'agent' | 'service' | null;
  actorAgentId: string | null;
  actorRunId: string | null;
  actorUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanReviewLink {
  id: string;
  planId: string;
  roundId: string;
  sourceNodeId: string;
  targetNodeId: string | null;
  relation: 'replies_to' | 'addresses' | 'because_of' | 'supports' | 'contradicts' | 'supersedes';
  sourceAnchor: Record<string, unknown> | null;
  targetAnchor: Record<string, unknown> | null;
  targetPlanAnchor: Record<string, unknown> | null;
  quote: string | null;
  meta: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PlanReviewGraphResponse {
  planId: string;
  rounds: PlanReviewRound[];
  nodes: PlanReviewNode[];
  links: PlanReviewLink[];
  requests: PlanRequest[];
}

export interface PlanReviewRoundCreateRequest {
  round_number?: number;
  review_revision?: number;
  status?: 'open' | 'changes_requested' | 'approved';
  note?: string;
}

export interface PlanReviewRoundUpdateRequest {
  status?: ReviewRoundStatus;
  conclusion?: string;
  note?: string;
}

export interface PlanReviewRefInput {
  relation: PlanReviewLink['relation'];
  target_node_id?: string;
  target_plan_anchor?: Record<string, unknown>;
  quote?: string;
}

export interface PlanReviewNodeCreateRequest {
  round_id: string;
  kind: ReviewNodeKind;
  author_role: ReviewAuthorRole;
  body: string;
  severity?: NonNullable<PlanReviewNode['severity']>;
  refs?: PlanReviewRefInput[];
}

export interface PlanReviewNodeCreateResponse {
  node: PlanReviewNode;
  links: PlanReviewLink[];
}

// ---------------------------------------------------------------------------
// Review requests
// ---------------------------------------------------------------------------

export interface PlanRequest {
  id: string;
  kind: string;
  dismissed: boolean;
  planId: string;
  roundId: string | null;
  title: string;
  body: string;
  status: ReviewRequestStatus;
  targetMode: 'auto' | 'session' | 'recent_agent' | null;
  targetAgentId: string | null;
  targetAgentType: string | null;
  targetSessionId: string | null;
  preferredAgentId: string | null;
  targetProfileId: string | null;
  targetMethod: string | null;
  targetModelId: string | null;
  targetProvider: string | null;
  reviewMode: ReviewRequestMode;
  baseRevision: number | null;
  queueIfBusy: boolean;
  autoRerouteIfBusy: boolean;
  dispatchState: 'assigned' | 'queued' | 'unassigned' | null;
  dispatchReason: string | null;
  requestedBy: string | null;
  requestedByPrincipalType: 'user' | 'agent' | 'service' | null;
  requestedByAgentId: string | null;
  requestedByRunId: string | null;
  requestedByUserId: number | null;
  meta: Record<string, unknown> | null;
  resolutionNote: string | null;
  resolvedNodeId: string | null;
  resolvedBy: string | null;
  resolvedByPrincipalType: 'user' | 'agent' | 'service' | null;
  resolvedByAgentId: string | null;
  resolvedByRunId: string | null;
  resolvedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface PlanRequestCreateRequest {
  kind?: string;
  round_id?: string;
  title: string;
  body: string;
  target_mode?: 'auto' | 'session' | 'recent_agent';
  target_agent_id?: string;
  target_agent_type?: string;
  target_session_id?: string;
  preferred_agent_id?: string;
  target_profile_id?: string;
  target_method?: string;
  target_model_id?: string;
  target_provider?: string;
  target_user_id?: number;
  review_mode?: ReviewRequestMode;
  base_revision?: number;
  queue_if_busy?: boolean;
  auto_reroute_if_busy?: boolean;
}

export interface PlanRequestUpdateRequest {
  status?: ReviewRequestStatus;
  resolution_note?: string;
  resolved_node_id?: string;
}

export interface PlanRequestDispatchRequest {
  timeout_seconds?: number;
  spawn_if_missing?: boolean;
  create_round_if_missing?: boolean;
}

export interface PlanRequestDispatchResponse {
  request: PlanRequest;
  node: PlanReviewNode | null;
  executed: boolean;
  message: string;
  durationMs: number | null;
}

// ---------------------------------------------------------------------------
// Dispatch tick
// ---------------------------------------------------------------------------

export interface PlanReviewDispatchTickItem {
  planId: string;
  requestId: string;
  status: string;
  executed: boolean;
  message: string;
  dispatchState: 'assigned' | 'queued' | 'unassigned' | null;
  resolvedNodeId: string | null;
}

export interface PlanReviewDispatchTickResponse {
  attempted: number;
  processed: number;
  items: PlanReviewDispatchTickItem[];
}

// ---------------------------------------------------------------------------
// Review pool / assignees
// ---------------------------------------------------------------------------

export interface PlanReviewPoolSession {
  sessionId: string;
  engine: string;
  state: string;
  cliModel: string | null;
  messagesSent: number;
  contextPct: number | null;
}

export interface PlanReviewAssignee {
  id: string;
  label: string;
  source: 'live' | 'recent' | 'delegated';
  targetMode: 'session' | 'recent_agent';
  bridgeId: string | null;
  targetUserId: number | null;
  targetSessionId: string | null;
  agentId: string;
  agentType: string | null;
  busy: boolean;
  availableNow: boolean;
  activeTasks: number;
  tasksCompleted: number;
  connectedAt: string | null;
  lastSeenAt: string | null;
  modelId: string | null;
  engines: string[];
  poolSessions: PlanReviewPoolSession[];
}

export interface PlanReviewAssigneesResponse {
  planId: string;
  generatedAt: string;
  liveSessions: PlanReviewAssignee[];
  recentAgents: PlanReviewAssignee[];
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export interface PlanParticipant {
  id: string;
  planId: string;
  role: 'builder' | 'reviewer';
  principalType: 'user' | 'agent' | 'service' | null;
  agentId: string | null;
  agentType: string | null;
  profileId: string | null;
  runId: string | null;
  sessionId: string | null;
  userId: number | null;
  touches: number;
  lastAction: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  meta: Record<string, unknown> | null;
}

export interface PlanParticipantsResponse {
  planId: string;
  generatedAt: string;
  participants: PlanParticipant[];
  reviewers: PlanParticipant[];
  builders: PlanParticipant[];
}

// ---------------------------------------------------------------------------
// Agent profiles
// ---------------------------------------------------------------------------

export interface ReviewAgentProfileEntry {
  id: string;
  label: string;
  agent_type: string;
  model_id: string | null;
  method: string | null;
  config: Record<string, unknown> | null;
  status: string;
}

export interface ReviewAgentProfileListResponse {
  profiles: ReviewAgentProfileEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// Source preview
// ---------------------------------------------------------------------------

export interface PlanSourcePreviewLine {
  lineNumber: number;
  text: string;
}

export interface PlanSourcePreviewResponse {
  planId: string;
  path: string;
  startLine: number;
  endLine: number;
  lines: PlanSourcePreviewLine[];
}

export interface SourceRefMatch {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
}

// ---------------------------------------------------------------------------
// Agent sessions
// ---------------------------------------------------------------------------

export interface AgentSessionActivity {
  action: string;
  detail: string;
  timestamp: string;
}

export interface AgentSessionSnapshot {
  session_id: string;
  agent_type: string;
  status: string;
  plan_id: string | null;
  contract_id: string | null;
  action: string;
  detail: string;
  recent_activity: AgentSessionActivity[];
}

export interface AgentSessionsSnapshot {
  active: AgentSessionSnapshot[];
}

// ---------------------------------------------------------------------------
// Revision conflict
// ---------------------------------------------------------------------------

export interface PlanRevisionConflict {
  expectedRevision: number;
  currentRevision: number;
}
