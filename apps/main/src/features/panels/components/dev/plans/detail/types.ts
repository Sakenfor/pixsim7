/**
 * Shared types and constants for PlanDetailView sub-components.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import type { Checkpoint } from '../PlanCheckpointList';

// =============================================================================
// Types
// =============================================================================

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

export type ReviewRoundStatus = 'open' | 'changes_requested' | 'approved' | 'concluded';
export type ReviewNodeKind = 'comment' | 'agent_response' | 'conclusion' | 'note';
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

export interface PlanRevisionConflict {
  expectedRevision: number;
  currentRevision: number;
}

// =============================================================================
// Constants
// =============================================================================

export const STATUS_ORDER = ['active', 'done', 'parked'] as const;

export const FALLBACK_PLAN_STAGE_OPTIONS: PlanStageOptionEntry[] = [
  { value: 'backlog', label: 'Backlog', description: 'Known work not yet actively proposed.', aliases: [] },
  { value: 'proposed', label: 'Proposed', description: 'Idea has scope, but implementation has not started.', aliases: [] },
  { value: 'discovery', label: 'Discovery', description: 'Research, analysis, and requirement clarification.', aliases: [] },
  { value: 'design', label: 'Design', description: 'Architecture/contract/design decisions are being finalized.', aliases: [] },
  { value: 'implementation', label: 'Implementation', description: 'Code/content changes are actively being built.', aliases: [] },
  { value: 'validation', label: 'Validation', description: 'Testing, verification, and stabilization before release.', aliases: [] },
  { value: 'rollout', label: 'Rollout', description: 'Deployment, migration, and staged release execution.', aliases: [] },
  { value: 'completed', label: 'Completed', description: 'Work is fully delivered and closed out.', aliases: [] },
];

export const STAGE_ICONS: Record<string, string> = {
  backlog: 'pause',
  proposed: 'fileText',
  discovery: 'search',
  design: 'checkSquare',
  implementation: 'code',
  validation: 'search',
  rollout: 'git-branch',
  completed: 'checkCircle',
  // Legacy values kept to avoid a visual regression while old rows are still in DB.
  'design-approved': 'checkSquare',
  'implementation-ready': 'code',
  'in-progress': 'play',
  complete: 'checkCircle',
};

export const STATUS_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  active: 'green',
  done: 'blue',
  parked: 'gray',
  blocked: 'red',
};

export const PRIORITY_COLORS: Record<string, 'red' | 'orange' | 'gray'> = {
  high: 'red',
  normal: 'orange',
  low: 'gray',
};

export const STATUS_ICONS: Record<string, string> = {
  active: 'play',
  done: 'checkCircle',
  parked: 'pause',
};

export const STATUS_DOT_CLASSES: Record<string, string> = {
  active: 'bg-green-500',
  done: 'bg-blue-400',
  parked: 'bg-neutral-400',
  blocked: 'bg-red-500',
};

export const PLAN_TYPE_ICONS: Record<string, string> = {
  feature: 'sparkles',
  bugfix: 'wrench',
  refactor: 'refreshCw',
  exploration: 'search',
  task: 'checkSquare',
  proposal: 'fileText',
  strategy: 'target',
  reference: 'library',
};

export const STAGE_BADGE_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  backlog: 'gray',
  proposed: 'gray',
  discovery: 'blue',
  design: 'blue',
  implementation: 'orange',
  validation: 'orange',
  rollout: 'blue',
  completed: 'green',
  'implementation-ready': 'blue',
  'in-progress': 'orange',
  complete: 'green',
};

export const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export const REVIEW_ROUND_STATUS_COLORS: Record<ReviewRoundStatus, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  changes_requested: 'orange',
  approved: 'green',
  concluded: 'gray',
};

export const ITERATION_STATUS_LABELS: Record<ReviewRoundStatus, string> = {
  open: 'Active',
  changes_requested: 'Needs Action',
  approved: 'Completed',
  concluded: 'Closed',
};

export const REVIEW_REQUEST_STATUS_COLORS: Record<ReviewRequestStatus, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  in_progress: 'orange',
  fulfilled: 'green',
  cancelled: 'gray',
};

export const REVIEW_REQUEST_DISPATCH_COLORS: Record<'assigned' | 'queued' | 'unassigned', 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  assigned: 'green',
  queued: 'orange',
  unassigned: 'gray',
};

export const REVIEW_AUTHOR_ROLE_COLORS: Record<ReviewAuthorRole, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  reviewer: 'orange',
  author: 'blue',
  agent: 'green',
  system: 'gray',
};

export const REVIEW_SEVERITY_COLORS: Record<NonNullable<PlanReviewNode['severity']>, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  info: 'gray',
  low: 'blue',
  medium: 'orange',
  high: 'red',
  critical: 'red',
};

export const REVIEW_RELATIONS: { value: PlanReviewLink['relation']; label: string; requiresTargetNode: boolean }[] = [
  { value: 'replies_to', label: 'Replies To', requiresTargetNode: false },
  { value: 'addresses', label: 'Addresses', requiresTargetNode: false },
  { value: 'because_of', label: 'Because Of', requiresTargetNode: true },
  { value: 'supports', label: 'Supports', requiresTargetNode: true },
  { value: 'contradicts', label: 'Contradicts', requiresTargetNode: true },
  { value: 'supersedes', label: 'Supersedes', requiresTargetNode: true },
];

export const REVIEW_CAUSAL_RELATIONS = new Set<PlanReviewLink['relation']>([
  'because_of',
  'supports',
  'contradicts',
  'supersedes',
]);

// =============================================================================
// Helpers
// =============================================================================

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function extractRevisionConflict(err: unknown): PlanRevisionConflict | null {
  const resp = (err as { response?: { status?: number; data?: { detail?: Record<string, unknown> } } })?.response;
  if (resp?.status !== 409) return null;
  const detail = resp.data?.detail;
  if (detail?.error !== 'plan_revision_conflict') return null;
  return {
    expectedRevision: detail.expected_revision as number,
    currentRevision: detail.current_revision as number,
  };
}

export function isCanonicalPlanId(value: string): boolean {
  return PLAN_ID_RE.test(value);
}

export function humanizeToken(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function stageLabelFromValue(stage: string, stageOptionsByValue: Map<string, PlanStageOptionEntry>): string {
  const fromOptions = stageOptionsByValue.get(stage)?.label;
  if (fromOptions) return fromOptions;
  return stage
    .split(/[-_]/g)
    .filter(Boolean)
    .map(humanizeToken)
    .join(' ');
}

const SOURCE_REF_RE = /([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+):(\d+)(?:-(\d+))?/g;

export function extractSourceRefs(text: string): SourceRefMatch[] {
  if (!text) return [];
  const out: SourceRefMatch[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(SOURCE_REF_RE)) {
    const path = (match[1] ?? '').replace(/\\/g, '/');
    const startRaw = match[2] ?? '';
    const endRaw = match[3] ?? startRaw;
    const startLine = Number.parseInt(startRaw, 10);
    const endLine = Number.parseInt(endRaw, 10);
    if (!path || !Number.isFinite(startLine) || !Number.isFinite(endLine)) continue;
    if (startLine < 1 || endLine < startLine) continue;
    const key = `${path}:${startLine}-${endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      raw: `${path}:${startLine}${endLine !== startLine ? `-${endLine}` : ''}`,
      path,
      startLine,
      endLine,
    });
  }

  return out;
}

export function formatReviewRelation(relation: PlanReviewLink['relation']): string {
  return relation.replace(/_/g, ' ');
}

export function buildAssigneeOptionValue(kind: 'live' | 'recent', id: string): string {
  return `${kind}:${id}`;
}

export function parseAssigneeOptionValue(value: string): { kind: 'live' | 'recent'; id: string } | null {
  if (!value.includes(':')) return null;
  const [kindRaw, ...rest] = value.split(':');
  const id = rest.join(':').trim();
  if (!id) return null;
  if (kindRaw === 'live' || kindRaw === 'recent') {
    return { kind: kindRaw, id };
  }
  return null;
}
