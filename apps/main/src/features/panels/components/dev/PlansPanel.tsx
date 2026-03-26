/**
 * PlansPanel - Plan registry browser for dev tools
 *
 * Sidebar: plans grouped by status (active/done/parked), filterable.
 * Content: plan detail with metadata, markdown, and action buttons.
 * Uses GET /dev/plans, GET /dev/plans/{id}, PATCH /dev/plans/update/{id}.
 */

import {
  Badge,
  Button,
  DisclosureSection,
  Dropdown,
  DropdownItem,
  EmptyState,
  FilterPillGroup,
  type FilterPillOption,
  Popover,
  SearchInput,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import {
  CheckpointList,
  getCheckpointPointProgress,
  type Checkpoint,
} from './plans/PlanCheckpointList';
import { PlanReviewDiscussion } from './plans/PlanReviewDiscussion';
import { PlanReviewRequestCard } from './plans/PlanReviewRequestCard';
import { PlanReviewRequestForm } from './plans/PlanReviewRequestForm';
import { PlanReviewResponseForm } from './plans/PlanReviewResponseForm';

// =============================================================================
// Types
// =============================================================================

interface PlanTarget {
  type: string;
  id: string;
  description: string;
  paths?: string[];
}

interface PlanChildSummary {
  id: string;
  title: string;
  status: string;
  stage: string;
  priority: string;
}

interface PlanSummary {
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

interface PlanDetail extends PlanSummary {
  planPath: string;
  markdown: string;
}

interface PlansIndexResponse {
  version: string;
  generatedAt: string | null;
  plans: PlanSummary[];
}

interface PlanUpdateResponse {
  planId: string;
  changes: { field: string; old: string; new: string }[];
  revision: number | null;
  commitSha: string | null;
  newScope: string | null;
}

interface PlanStageOptionEntry {
  value: string;
  label: string;
  description: string;
  aliases: string[];
}

interface PlanStagesResponse {
  defaultStage: string;
  stages: PlanStageOptionEntry[];
}

type ReviewRoundStatus = 'open' | 'changes_requested' | 'approved' | 'concluded';
type ReviewNodeKind = 'review_comment' | 'agent_response' | 'conclusion' | 'note';
type ReviewAuthorRole = 'reviewer' | 'author' | 'agent' | 'system';
type ReviewRequestStatus = 'open' | 'in_progress' | 'fulfilled' | 'cancelled';
type ReviewRequestQueuePolicy = 'start_now' | 'queue_next' | 'auto_reroute';
type ReviewRequestKind = 'review' | 'build' | 'research';
type ReviewRequestMode = 'review_only' | 'propose_patch' | 'apply_patch';

interface PlanReviewRound {
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

interface PlanReviewNode {
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

interface PlanReviewLink {
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

interface PlanReviewGraphResponse {
  planId: string;
  rounds: PlanReviewRound[];
  nodes: PlanReviewNode[];
  links: PlanReviewLink[];
  requests: PlanRequest[];
}

interface PlanReviewRoundCreateRequest {
  round_number?: number;
  review_revision?: number;
  status?: 'open' | 'changes_requested' | 'approved';
  note?: string;
}

interface PlanReviewRoundUpdateRequest {
  status?: ReviewRoundStatus;
  conclusion?: string;
  note?: string;
}

interface PlanReviewRefInput {
  relation: PlanReviewLink['relation'];
  target_node_id?: string;
  target_plan_anchor?: Record<string, unknown>;
  quote?: string;
}

interface PlanReviewNodeCreateRequest {
  round_id: string;
  kind: ReviewNodeKind;
  author_role: ReviewAuthorRole;
  body: string;
  severity?: NonNullable<PlanReviewNode['severity']>;
  refs?: PlanReviewRefInput[];
}

interface PlanReviewNodeCreateResponse {
  node: PlanReviewNode;
  links: PlanReviewLink[];
}

interface PlanRequest {
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

interface PlanRequestCreateRequest {
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

interface PlanRequestUpdateRequest {
  status?: ReviewRequestStatus;
  resolution_note?: string;
  resolved_node_id?: string;
}

interface PlanRequestDispatchRequest {
  timeout_seconds?: number;
  spawn_if_missing?: boolean;
  create_round_if_missing?: boolean;
}

interface PlanRequestDispatchResponse {
  request: PlanRequest;
  node: PlanReviewNode | null;
  executed: boolean;
  message: string;
  durationMs: number | null;
}

interface PlanReviewDispatchTickItem {
  planId: string;
  requestId: string;
  status: string;
  executed: boolean;
  message: string;
  dispatchState: 'assigned' | 'queued' | 'unassigned' | null;
  resolvedNodeId: string | null;
}

interface PlanReviewDispatchTickResponse {
  attempted: number;
  processed: number;
  items: PlanReviewDispatchTickItem[];
}

interface PlanReviewPoolSession {
  sessionId: string;
  engine: string;
  state: string;
  cliModel: string | null;
  messagesSent: number;
  contextPct: number | null;
}

interface PlanReviewAssignee {
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

interface PlanReviewAssigneesResponse {
  planId: string;
  generatedAt: string;
  liveSessions: PlanReviewAssignee[];
  recentAgents: PlanReviewAssignee[];
}

interface PlanParticipant {
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

interface PlanParticipantsResponse {
  planId: string;
  generatedAt: string;
  participants: PlanParticipant[];
  reviewers: PlanParticipant[];
  builders: PlanParticipant[];
}

interface ReviewAgentProfileEntry {
  id: string;
  label: string;
  agent_type: string;
  model_id: string | null;
  method: string | null;
  config: Record<string, unknown> | null;
  status: string;
}

interface ReviewAgentProfileListResponse {
  profiles: ReviewAgentProfileEntry[];
  total: number;
}

interface PlanSourcePreviewLine {
  lineNumber: number;
  text: string;
}

interface PlanSourcePreviewResponse {
  planId: string;
  path: string;
  startLine: number;
  endLine: number;
  lines: PlanSourcePreviewLine[];
}

interface SourceRefMatch {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
}

interface AgentSessionActivity {
  action: string;
  detail: string;
  timestamp: string;
}

interface AgentSessionSnapshot {
  session_id: string;
  agent_type: string;
  status: string;
  plan_id: string | null;
  contract_id: string | null;
  action: string;
  detail: string;
  recent_activity: AgentSessionActivity[];
}

interface AgentSessionsSnapshot {
  active: AgentSessionSnapshot[];
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_ORDER = ['active', 'done', 'parked'] as const;

const FALLBACK_PLAN_STAGE_OPTIONS: PlanStageOptionEntry[] = [
  { value: 'backlog', label: 'Backlog', description: 'Known work not yet actively proposed.', aliases: [] },
  { value: 'proposed', label: 'Proposed', description: 'Idea has scope, but implementation has not started.', aliases: [] },
  { value: 'discovery', label: 'Discovery', description: 'Research, analysis, and requirement clarification.', aliases: [] },
  { value: 'design', label: 'Design', description: 'Architecture/contract/design decisions are being finalized.', aliases: [] },
  { value: 'implementation', label: 'Implementation', description: 'Code/content changes are actively being built.', aliases: [] },
  { value: 'validation', label: 'Validation', description: 'Testing, verification, and stabilization before release.', aliases: [] },
  { value: 'rollout', label: 'Rollout', description: 'Deployment, migration, and staged release execution.', aliases: [] },
  { value: 'completed', label: 'Completed', description: 'Work is fully delivered and closed out.', aliases: [] },
];

const STAGE_ICONS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  active: 'green',
  done: 'blue',
  parked: 'gray',
  blocked: 'red',
};

const PRIORITY_COLORS: Record<string, 'red' | 'orange' | 'gray'> = {
  high: 'red',
  medium: 'orange',
  low: 'gray',
};

const STATUS_ICONS: Record<string, string> = {
  active: 'play',
  done: 'checkCircle',
  parked: 'pause',
};

const STATUS_DOT_CLASSES: Record<string, string> = {
  active: 'bg-green-500',
  done: 'bg-blue-400',
  parked: 'bg-neutral-400',
  blocked: 'bg-red-500',
};

const PLAN_TYPE_ICONS: Record<string, string> = {
  feature: 'sparkles',
  bugfix: 'wrench',
  refactor: 'refreshCw',
  exploration: 'search',
  task: 'checkSquare',
  proposal: 'fileText',
};




const STAGE_BADGE_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
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

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

const REVIEW_ROUND_STATUS_COLORS: Record<ReviewRoundStatus, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  changes_requested: 'orange',
  approved: 'green',
  concluded: 'gray',
};

const REVIEW_REQUEST_STATUS_COLORS: Record<ReviewRequestStatus, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  in_progress: 'orange',
  fulfilled: 'green',
  cancelled: 'gray',
};

const REVIEW_REQUEST_DISPATCH_COLORS: Record<'assigned' | 'queued' | 'unassigned', 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  assigned: 'green',
  queued: 'orange',
  unassigned: 'gray',
};

const REVIEW_AUTHOR_ROLE_COLORS: Record<ReviewAuthorRole, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  reviewer: 'orange',
  author: 'blue',
  agent: 'green',
  system: 'gray',
};

const REVIEW_SEVERITY_COLORS: Record<NonNullable<PlanReviewNode['severity']>, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  info: 'gray',
  low: 'blue',
  medium: 'orange',
  high: 'red',
  critical: 'red',
};

const REVIEW_RELATIONS: { value: PlanReviewLink['relation']; label: string; requiresTargetNode: boolean }[] = [
  { value: 'replies_to', label: 'Replies To', requiresTargetNode: false },
  { value: 'addresses', label: 'Addresses', requiresTargetNode: false },
  { value: 'because_of', label: 'Because Of', requiresTargetNode: true },
  { value: 'supports', label: 'Supports', requiresTargetNode: true },
  { value: 'contradicts', label: 'Contradicts', requiresTargetNode: true },
  { value: 'supersedes', label: 'Supersedes', requiresTargetNode: true },
];

const REVIEW_CAUSAL_RELATIONS = new Set<PlanReviewLink['relation']>([
  'because_of',
  'supports',
  'contradicts',
  'supersedes',
]);

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
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

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface PlanRevisionConflict {
  expectedRevision: number;
  currentRevision: number;
}

function extractRevisionConflict(err: unknown): PlanRevisionConflict | null {
  const resp = (err as { response?: { status?: number; data?: { detail?: Record<string, unknown> } } })?.response;
  if (resp?.status !== 409) return null;
  const detail = resp.data?.detail;
  if (detail?.error !== 'plan_revision_conflict') return null;
  return {
    expectedRevision: detail.expected_revision as number,
    currentRevision: detail.current_revision as number,
  };
}

function isCanonicalPlanId(value: string): boolean {
  return PLAN_ID_RE.test(value);
}

function humanizeToken(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stageLabelFromValue(stage: string, stageOptionsByValue: Map<string, PlanStageOptionEntry>): string {
  const fromOptions = stageOptionsByValue.get(stage)?.label;
  if (fromOptions) return fromOptions;
  return stage
    .split(/[-_]/g)
    .filter(Boolean)
    .map(humanizeToken)
    .join(' ');
}

const SOURCE_REF_RE = /([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+):(\d+)(?:-(\d+))?/g;

function extractSourceRefs(text: string): SourceRefMatch[] {
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

function formatReviewRelation(relation: PlanReviewLink['relation']): string {
  return relation.replace(/_/g, ' ');
}

function buildAssigneeOptionValue(kind: 'live' | 'recent', id: string): string {
  return `${kind}:${id}`;
}

function parseAssigneeOptionValue(value: string): { kind: 'live' | 'recent'; id: string } | null {
  if (!value.includes(':')) return null;
  const [kindRaw, ...rest] = value.split(':');
  const id = rest.join(':').trim();
  if (!id) return null;
  if (kindRaw === 'live' || kindRaw === 'recent') {
    return { kind: kindRaw, id };
  }
  return null;
}

// =============================================================================
// Clickable Badge with Dropdown
// =============================================================================

function ClickableBadge({
  value,
  displayValue,
  color,
  options,
  onSelect,
  disabled,
}: {
  value: string;
  displayValue?: string;
  color: 'green' | 'blue' | 'gray' | 'orange' | 'red';
  options: { value: string; label: string; color: 'green' | 'blue' | 'gray' | 'orange' | 'red' }[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="cursor-pointer hover:opacity-80 transition-opacity"
        disabled={disabled}
      >
        <Badge color={color}>
          {displayValue ?? value}
          <Icon name="chevronDown" size={8} className="ml-0.5 inline-block opacity-50" />
        </Badge>
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        minWidth="100px"
      >
        {options.map((opt) => (
          <DropdownItem
            key={opt.value}
            onClick={() => {
              onSelect(opt.value);
              setOpen(false);
            }}
            icon={<Badge color={opt.color} className="text-[9px] !px-1">{opt.value === value ? '\u2713' : '\u00A0'}</Badge>}
          >
            {opt.label}
          </DropdownItem>
        ))}
      </Dropdown>
    </span>
  );
}

function ParticipantEntry({
  participant,
  profileLabels,
  open,
  onToggle,
}: {
  participant: PlanParticipant;
  profileLabels: ReadonlyMap<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = formatActorLabel(
    {
      principalType: participant.principalType,
      userId: participant.userId,
      agentId: participant.agentId,
      profileId: participant.profileId,
    },
    { profileLabels },
  );
  const profileLabel = participant.profileId
    ? (profileLabels.get(participant.profileId) ?? participant.profileId)
    : null;
  const actionLog = (participant.meta?.action_log as { action: string; at: string }[] | undefined) ?? [];
  const summaryAction = participant.lastAction ? participant.lastAction.replace(/_/g, ' ') : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Click to view participant details"
        className="flex w-full items-center justify-between gap-2 text-[11px] text-left group hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1 -mx-1 py-0.5 cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="font-mono text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline group-hover:decoration-dotted">
            {label}
          </span>
          <span className="text-neutral-400 group-hover:text-blue-500">({participant.touches}x)</span>
          {summaryAction && (
            <span className="text-neutral-400 text-[10px] truncate">{summaryAction}</span>
          )}
        </span>
        <Icon
          name="chevronDown"
          size={8}
          className={`shrink-0 transition-transform text-neutral-400 group-hover:text-blue-500 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        open={open}
        onClose={() => { if (open) onToggle(); }}
        triggerRef={triggerRef}
        className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 max-w-xs"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
            <Badge color="gray" className="text-[9px]">{participant.role}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {participant.agentType && (
              <>
                <span className="text-neutral-400">Type</span>
                <span className="text-neutral-600 dark:text-neutral-300">{participant.agentType}</span>
              </>
            )}
            {participant.profileId && (
              <>
                <span className="text-neutral-400">Profile</span>
                <span
                  className="text-neutral-600 dark:text-neutral-300"
                  title={profileLabel !== participant.profileId ? participant.profileId ?? undefined : undefined}
                >
                  {profileLabel}
                </span>
              </>
            )}
            <span className="text-neutral-400">Touches</span>
            <span className="text-neutral-600 dark:text-neutral-300">{participant.touches}</span>
            {participant.lastSeenAt && (
              <>
                <span className="text-neutral-400">Last seen</span>
                <span className="text-neutral-600 dark:text-neutral-300">{formatDateTime(participant.lastSeenAt)}</span>
              </>
            )}
            {participant.runId && (
              <>
                <span className="text-neutral-400">Run</span>
                <button
                  type="button"
                  className="text-neutral-600 dark:text-neutral-300 font-mono truncate text-left hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                  title="Copy run ID"
                  onClick={() => navigator.clipboard.writeText(participant.runId!)}
                >
                  {participant.runId}
                </button>
              </>
            )}
          </div>
          <div>
            <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Activity ({actionLog.length > 0 ? actionLog.length : participant.touches})
            </div>
            {actionLog.length > 0 ? (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {actionLog.map((entry, i) => (
                  <div key={`${participant.id}:action:${i}`} className="flex items-center gap-2 text-[10px]">
                    <span className="shrink-0 w-10 text-right text-neutral-400 font-mono">
                      {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-neutral-700 dark:text-neutral-300">{entry.action.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-neutral-400 italic">
                {participant.touches} touch{participant.touches !== 1 ? 'es' : ''} recorded before activity tracking.
                {participant.lastAction && <> Last: {participant.lastAction.replace(/_/g, ' ')}.</>}
              </div>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

function PlanDetailView({
  planId,
  onPlanChanged,
  onNavigatePlan,
  forgeUrlTemplate,
  stageOptions,
}: {
  planId: string;
  onPlanChanged: () => void;
  onNavigatePlan?: (planId: string) => void;
  forgeUrlTemplate?: string | null;
  stageOptions: PlanStageOptionEntry[];
}) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [coverage, setCoverage] = useState<{
    code_paths: string[];
    explicit_suites: string[];
    auto_discovered: { suite_id: string; suite_label: string; kind: string | null; matched_paths: string[] }[];
  } | null>(null);
  const [reviewGraph, setReviewGraph] = useState<PlanReviewGraphResponse | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [newRoundStatus, setNewRoundStatus] = useState<'open' | 'changes_requested' | 'approved'>('open');
  const [newRoundRevision, setNewRoundRevision] = useState('');
  const [newRoundNote, setNewRoundNote] = useState('');
  const [creatingRound, setCreatingRound] = useState(false);
  const [roundStatusDraft, setRoundStatusDraft] = useState<ReviewRoundStatus>('open');
  const [roundNoteDraft, setRoundNoteDraft] = useState('');
  const [roundConclusionDraft, setRoundConclusionDraft] = useState('');
  const [updatingRound, setUpdatingRound] = useState(false);
  const [newNodeKind, setNewNodeKind] = useState<ReviewNodeKind>('review_comment');
  const [newNodeAuthorRole, setNewNodeAuthorRole] = useState<ReviewAuthorRole>('reviewer');
  const [newNodeSeverity, setNewNodeSeverity] = useState<NonNullable<PlanReviewNode['severity']> | ''>('');
  const [newNodeBody, setNewNodeBody] = useState('');
  const [newNodeRefRelation, setNewNodeRefRelation] = useState<PlanReviewLink['relation']>('replies_to');
  const [newNodeRefTargetId, setNewNodeRefTargetId] = useState('');
  const [newNodeRefPlanAnchor, setNewNodeRefPlanAnchor] = useState('');
  const [newNodeRefQuote, setNewNodeRefQuote] = useState('');
  const [creatingNode, setCreatingNode] = useState(false);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestBody, setNewRequestBody] = useState('');
  const [reviewAssignees, setReviewAssignees] = useState<PlanReviewAssigneesResponse | null>(null);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [planParticipants, setPlanParticipants] = useState<PlanParticipantsResponse | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [reviewProfiles, setReviewProfiles] = useState<ReviewAgentProfileEntry[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [newRequestAssignee, setNewRequestAssignee] = useState('auto');
  const [newRequestProfileId, setNewRequestProfileId] = useState('');
  const [newRequestKind, setNewRequestKind] = useState<ReviewRequestKind>('review');
  const [newRequestMode, setNewRequestMode] = useState<ReviewRequestMode>('review_only');
  const [newRequestBaseRevision, setNewRequestBaseRevision] = useState('');
  const [newRequestQueuePolicy, setNewRequestQueuePolicy] = useState<ReviewRequestQueuePolicy>('auto_reroute');
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [dispatchingRequestId, setDispatchingRequestId] = useState<string | null>(null);
  const [dispatchingTick, setDispatchingTick] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<{
    nodeId: string;
    ref: SourceRefMatch;
    data: PlanSourcePreviewResponse;
  } | null>(null);
  const [sourcePreviewError, setSourcePreviewError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);
  const [sourcePreviewLoadingKey, setSourcePreviewLoadingKey] = useState<string | null>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-dismiss review notices (4s) and errors (8s)
  useEffect(() => {
    if (!reviewNotice) return;
    const t = setTimeout(() => setReviewNotice(null), 4000);
    return () => clearTimeout(t);
  }, [reviewNotice]);
  useEffect(() => {
    if (!reviewError) return;
    const t = setTimeout(() => setReviewError(''), 8000);
    return () => clearTimeout(t);
  }, [reviewError]);

  const encodedPlanId = useMemo(() => encodeURIComponent(planId), [planId]);
  const stageOptionsByValue = useMemo(
    () => new Map(stageOptions.map((stage) => [stage.value, stage])),
    [stageOptions],
  );
  const inputClassName =
    'w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100';
  const textAreaClassName =
    'w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100';

  const loadDetail = useCallback(() => {
    setLoading(true);
    setError('');
    pixsimClient
      .get<PlanDetail>(`/dev/plans/${encodedPlanId}?refresh=true`)
      .then((res) => setDetail(res))
      .catch((err) => setError(toErrorMessage(err, 'Failed to load plan')))
      .finally(() => setLoading(false));
  }, [encodedPlanId]);

  const loadReviewGraph = useCallback(async () => {
    setLoadingReviews(true);
    setLoadingAssignees(true);
    setLoadingParticipants(true);
    setLoadingProfiles(true);
    setReviewError('');
    try {
      const [graph, assignees, participants, profileList] = await Promise.all([
        pixsimClient.get<PlanReviewGraphResponse>(
          `/dev/plans/reviews/${encodedPlanId}/graph`,
        ),
        pixsimClient.get<PlanReviewAssigneesResponse>(
          `/dev/plans/reviews/${encodedPlanId}/assignees`,
        ).catch(() => null),
        pixsimClient.get<PlanParticipantsResponse>(
          `/dev/plans/${encodedPlanId}/participants`,
        ).catch(() => null),
        pixsimClient.get<ReviewAgentProfileListResponse>(
          '/dev/agent-profiles',
        ).catch(() => ({ profiles: [], total: 0 })),
      ]);
      setReviewGraph(graph);
      setReviewAssignees(assignees);
      setPlanParticipants(participants);
      setReviewProfiles((profileList.profiles ?? []).filter((p) => p.status === 'active'));
    } catch (err) {
      const message = toErrorMessage(err, 'Failed to load plan review graph');
      setReviewError(
        message.includes('404')
          ? 'Review API is unavailable. Restart backend with the latest review routes.'
          : message,
      );
      setReviewGraph(null);
      setReviewAssignees(null);
      setPlanParticipants(null);
      setReviewProfiles([]);
    } finally {
      setLoadingReviews(false);
      setLoadingAssignees(false);
      setLoadingParticipants(false);
      setLoadingProfiles(false);
    }
  }, [encodedPlanId]);

  useEffect(() => {
    loadDetail();
    // Load test coverage (non-blocking)
    pixsimClient
      .get<typeof coverage>(`/dev/plans/coverage/${encodedPlanId}`)
      .then(setCoverage)
      .catch(() => setCoverage(null));
  }, [loadDetail, encodedPlanId]);

  // Lazy-load review graph on first expand of the Agent Tasks section
  const reviewGraphLoadedRef = useRef(false);
  const onReviewSectionToggle = useCallback(
    (isOpen: boolean) => {
      if (isOpen && !reviewGraphLoadedRef.current) {
        reviewGraphLoadedRef.current = true;
        void loadReviewGraph();
      }
    },
    [loadReviewGraph],
  );

  // Poll agent sessions while any review request is in_progress
  const [agentSessions, setAgentSessions] = useState<Map<string, AgentSessionSnapshot>>(new Map());
  const hasInProgressRequests = useMemo(
    () => (reviewGraph?.requests ?? []).some((r) => r.status === 'in_progress'),
    [reviewGraph?.requests],
  );
  useEffect(() => {
    if (!hasInProgressRequests) {
      setAgentSessions(new Map());
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await pixsimClient.get<AgentSessionsSnapshot>('/meta/agents');
        if (cancelled) return;
        const map = new Map<string, AgentSessionSnapshot>();
        for (const s of res.active) map.set(s.session_id, s);
        setAgentSessions(map);
      } catch { /* non-critical */ }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [hasInProgressRequests]);

  // Also auto-refresh the review graph while requests are in-progress
  useEffect(() => {
    if (!hasInProgressRequests) return;
    const interval = setInterval(() => { void loadReviewGraph(); }, 10_000);
    return () => clearInterval(interval);
  }, [hasInProgressRequests, loadReviewGraph]);

  const handleUpdate = useCallback(() => {
    loadDetail();
    if (reviewGraphLoadedRef.current) {
      void loadReviewGraph();
    }
    onPlanChanged();
  }, [loadDetail, loadReviewGraph, onPlanChanged]);

  const applyUpdate = useCallback(
    async (updates: Record<string, string>) => {
      setUpdating(true);
      setLastResult(null);
      try {
        const payload: Record<string, unknown> = { ...updates };
        if (detail?.revision != null) {
          payload.expected_revision = detail.revision;
        }
        const res = await pixsimClient.patch<PlanUpdateResponse>(
          `/dev/plans/${encodedPlanId}`,
          payload,
        );
        const changed = res.changes.map((c) => `${c.field}: ${c.old}\u2192${c.new}`).join(', ');
        if (res.revision != null) {
          setDetail((prev) => prev ? { ...prev, revision: res.revision } : prev);
        }
        setLastResult(
          res.commitSha
            ? `Updated (${changed}) \u2014 committed ${res.commitSha.slice(0, 7)}`
            : `Updated (${changed})`,
        );
        handleUpdate();
      } catch (err) {
        const conflict = extractRevisionConflict(err);
        if (conflict) {
          setLastResult(
            `Conflict: plan was updated elsewhere (rev ${conflict.expectedRevision} \u2192 ${conflict.currentRevision}). Refreshing\u2026`,
          );
          handleUpdate();
        } else {
          setLastResult(`Failed: ${toErrorMessage(err, 'Unknown error')}`);
        }
      } finally {
        setUpdating(false);
      }
    },
    [encodedPlanId, detail?.revision, handleUpdate],
  );

  const reviewRounds = useMemo(() => {
    const rounds = reviewGraph?.rounds ?? [];
    return [...rounds].sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return b.roundNumber - a.roundNumber;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [reviewGraph?.rounds]);

  const reviewRoundNumberById = useMemo(() => {
    const map = new Map<string, number>();
    for (const round of reviewGraph?.rounds ?? []) {
      map.set(round.id, round.roundNumber);
    }
    return map;
  }, [reviewGraph?.rounds]);

  const reviewNodeCountByRound = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of reviewGraph?.nodes ?? []) {
      counts.set(node.roundId, (counts.get(node.roundId) ?? 0) + 1);
    }
    return counts;
  }, [reviewGraph?.nodes]);

  const reviewerParticipants = useMemo(
    () => planParticipants?.reviewers ?? [],
    [planParticipants?.reviewers],
  );

  const builderParticipants = useMemo(
    () => planParticipants?.builders ?? [],
    [planParticipants?.builders],
  );

  // Only one participant popover open at a time
  const [openParticipantId, setOpenParticipantId] = useState<string | null>(null);

  useEffect(() => {
    if (reviewRounds.length === 0) {
      setSelectedRoundId('');
      return;
    }
    setSelectedRoundId((prev) =>
      prev && reviewRounds.some((round) => round.id === prev) ? prev : reviewRounds[0]!.id,
    );
  }, [reviewRounds]);

  const selectedRound = useMemo(
    () => reviewRounds.find((round) => round.id === selectedRoundId) ?? null,
    [reviewRounds, selectedRoundId],
  );

  useEffect(() => {
    if (!selectedRound) {
      setRoundStatusDraft('open');
      setRoundNoteDraft('');
      setRoundConclusionDraft('');
      return;
    }
    setRoundStatusDraft(selectedRound.status);
    setRoundNoteDraft(selectedRound.note ?? '');
    setRoundConclusionDraft(selectedRound.conclusion ?? '');
  }, [selectedRound]);

  useEffect(() => {
    setSourcePreview(null);
    setSourcePreviewError(null);
    setSourcePreviewLoadingKey(null);
  }, [selectedRoundId]);

  const selectedRoundNodes = useMemo(() => {
    if (!selectedRoundId) return [];
    const nodes = (reviewGraph?.nodes ?? []).filter((node) => node.roundId === selectedRoundId);
    return [...nodes].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [reviewGraph?.nodes, selectedRoundId]);

  const selectedRoundRequests = useMemo(() => {
    const requests = reviewGraph?.requests ?? [];
    return [...requests]
      .filter((request) => !selectedRoundId || request.roundId === selectedRoundId || request.roundId === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reviewGraph?.requests, selectedRoundId]);

  // Nodes linked to dismissed requests - show faded in discussion
  const dismissedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of reviewGraph?.requests ?? []) {
      if (r.dismissed && r.resolvedNodeId) ids.add(r.resolvedNodeId);
    }
    // Also check node meta for request_id linkage
    for (const node of reviewGraph?.nodes ?? []) {
      const reqId = (node.meta as any)?.request_id;
      if (reqId) {
        const req = (reviewGraph?.requests ?? []).find((r) => r.id === reqId);
        if (req?.dismissed) ids.add(node.id);
      }
    }
    return ids;
  }, [reviewGraph?.requests, reviewGraph?.nodes]);

  const liveAssigneeOptions = useMemo(
    () => (reviewAssignees?.liveSessions ?? []),
    [reviewAssignees?.liveSessions],
  );

  const recentAssigneeOptions = useMemo(
    () => (reviewAssignees?.recentAgents ?? []),
    [reviewAssignees?.recentAgents],
  );

  const reviewProfileById = useMemo(
    () => new Map(reviewProfiles.map((profile) => [profile.id, profile])),
    [reviewProfiles],
  );

  const reviewProfileLabels = useMemo(
    () => new Map(reviewProfiles.map((profile) => [profile.id, profile.label])),
    [reviewProfiles],
  );

  const applyRequestProfileSelection = useCallback(
    (profileId: string) => {
      setNewRequestProfileId(profileId);
    },
    [],
  );

  useEffect(() => {
    if (newRequestAssignee === 'auto') return;
    const parsed = parseAssigneeOptionValue(newRequestAssignee);
    if (!parsed) {
      setNewRequestAssignee('auto');
      return;
    }
    if (parsed.kind === 'live') {
      const exists = liveAssigneeOptions.some((opt) => opt.agentId === parsed.id);
      if (!exists) setNewRequestAssignee('auto');
      return;
    }
    const exists = recentAssigneeOptions.some((opt) => opt.agentId === parsed.id);
    if (!exists) setNewRequestAssignee('auto');
  }, [liveAssigneeOptions, newRequestAssignee, recentAssigneeOptions]);

  useEffect(() => {
    if (!newRequestProfileId) return;
    if (reviewProfileById.has(newRequestProfileId)) return;
    setNewRequestProfileId('');
  }, [newRequestProfileId, reviewProfileById]);

  const selectedRoundLinksBySource = useMemo(() => {
    const bySource = new Map<string, PlanReviewLink[]>();
    for (const link of reviewGraph?.links ?? []) {
      if (selectedRoundId && link.roundId !== selectedRoundId) continue;
      const links = bySource.get(link.sourceNodeId) ?? [];
      links.push(link);
      bySource.set(link.sourceNodeId, links);
    }
    return bySource;
  }, [reviewGraph?.links, selectedRoundId]);

  const selectedRoundNodeOrder = useMemo(() => {
    const order = new Map<string, number>();
    selectedRoundNodes.forEach((node, idx) => {
      order.set(node.id, idx + 1);
    });
    return order;
  }, [selectedRoundNodes]);

  const selectedRoundThreadRefByChild = useMemo(() => {
    const relationRank: Record<PlanReviewLink['relation'], number> = {
      replies_to: 0,
      addresses: 1,
      because_of: 2,
      supports: 2,
      contradicts: 2,
      supersedes: 2,
    };
    const selectedIds = new Set(selectedRoundNodes.map((node) => node.id));
    const bestRefByChild = new Map<
      string,
      { parentId: string; linkId: string; relation: PlanReviewLink['relation']; rank: number }
    >();
    for (const link of reviewGraph?.links ?? []) {
      if (selectedRoundId && link.roundId !== selectedRoundId) continue;
      if (!selectedIds.has(link.sourceNodeId)) continue;
      if (!link.targetNodeId || !selectedIds.has(link.targetNodeId)) continue;
      if (link.targetNodeId === link.sourceNodeId) continue;
      const rank = relationRank[link.relation] ?? 99;
      const existing = bestRefByChild.get(link.sourceNodeId);
      if (!existing || rank < existing.rank) {
        bestRefByChild.set(link.sourceNodeId, {
          parentId: link.targetNodeId,
          linkId: link.id,
          relation: link.relation,
          rank,
        });
      }
    }
    const result = new Map<string, { parentId: string; linkId: string; relation: PlanReviewLink['relation'] }>();
    for (const [childId, ref] of bestRefByChild) {
      result.set(childId, {
        parentId: ref.parentId,
        linkId: ref.linkId,
        relation: ref.relation,
      });
    }
    return result;
  }, [reviewGraph?.links, selectedRoundId, selectedRoundNodes]);

  const selectedRoundThread = useMemo(() => {
    const nodeById = new Map(selectedRoundNodes.map((node) => [node.id, node]));
    const childrenByParent = new Map<string, PlanReviewNode[]>();
    const childIds = new Set<string>();

    for (const node of selectedRoundNodes) {
      const parentId = selectedRoundThreadRefByChild.get(node.id)?.parentId;
      if (!parentId || !nodeById.has(parentId)) continue;
      childIds.add(node.id);
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(node);
      childrenByParent.set(parentId, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    const roots = selectedRoundNodes.filter((node) => !childIds.has(node.id));
    return {
      roots: roots.length > 0 ? roots : selectedRoundNodes,
      childrenByParent,
    };
  }, [selectedRoundNodes, selectedRoundThreadRefByChild]);

  const nodeById = useMemo(() => {
    const map = new Map<string, PlanReviewNode>();
    for (const node of reviewGraph?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [reviewGraph?.nodes]);

  const focusLinkedNode = useCallback(
    (targetNodeId: string) => {
      const targetNode = nodeById.get(targetNodeId);
      if (!targetNode) return;
      if (targetNode.roundId !== selectedRoundId) {
        setSelectedRoundId(targetNode.roundId);
      }
      setPendingFocusNodeId(targetNode.id);
    },
    [nodeById, selectedRoundId],
  );

  const previewSourceRef = useCallback(
    async (nodeId: string, ref: SourceRefMatch) => {
      const key = `${nodeId}:${ref.path}:${ref.startLine}-${ref.endLine}`;
      setSourcePreviewLoadingKey(key);
      setSourcePreviewError(null);
      try {
        const query = new URLSearchParams({
          path: ref.path,
          start_line: String(ref.startLine),
          end_line: String(ref.endLine),
        });
        const data = await pixsimClient.get<PlanSourcePreviewResponse>(
          `/dev/plans/reviews/${encodedPlanId}/source-preview?${query.toString()}`,
        );
        setSourcePreview({ nodeId, ref, data });
      } catch (err) {
        setSourcePreviewError({
          nodeId,
          message: toErrorMessage(err, 'Failed to load source preview'),
        });
      } finally {
        setSourcePreviewLoadingKey(null);
      }
    },
    [encodedPlanId],
  );

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const el = nodeCardRefs.current.get(pendingFocusNodeId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedNodeId(pendingFocusNodeId);
    setPendingFocusNodeId(null);
    const timeout = window.setTimeout(() => {
      setFocusedNodeId((current) => (current === pendingFocusNodeId ? null : current));
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [pendingFocusNodeId, selectedRoundId, selectedRoundNodes]);

  const relationOptions = useMemo(
    () => REVIEW_RELATIONS.filter((r) => newNodeRefTargetId || !r.requiresTargetNode),
    [newNodeRefTargetId],
  );

  useEffect(() => {
    if (!newNodeRefTargetId && REVIEW_CAUSAL_RELATIONS.has(newNodeRefRelation)) {
      setNewNodeRefRelation('addresses');
    }
  }, [newNodeRefTargetId, newNodeRefRelation]);

  const handleCreateRound = useCallback(async () => {
    setCreatingRound(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const payload: PlanReviewRoundCreateRequest = { status: newRoundStatus };
      const note = newRoundNote.trim();
      if (note) payload.note = note;

      const revisionRaw = newRoundRevision.trim();
      if (revisionRaw) {
        const parsed = Number.parseInt(revisionRaw, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          setReviewError('Iteration revision must be a positive integer.');
          return;
        }
        payload.review_revision = parsed;
      }

      const round = await pixsimClient.post<PlanReviewRound>(
        `/dev/plans/reviews/${encodedPlanId}/rounds`,
        payload,
      );
      setNewRoundRevision('');
      setNewRoundNote('');
      setSelectedRoundId(round.id);
      setReviewNotice(`Created iteration #${round.roundNumber}.`);
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create iteration'));
    } finally {
      setCreatingRound(false);
    }
  }, [encodedPlanId, loadReviewGraph, newRoundNote, newRoundRevision, newRoundStatus]);

  const handleUpdateRound = useCallback(
    async (payload: PlanReviewRoundUpdateRequest, successMessage: string) => {
      if (!selectedRound) {
        setReviewError('Select an iteration first.');
        return;
      }
      setUpdatingRound(true);
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanReviewRound>(
          `/dev/plans/reviews/${encodedPlanId}/rounds/${encodeURIComponent(selectedRound.id)}`,
          payload,
        );
        setReviewNotice(successMessage);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to update iteration'));
      } finally {
        setUpdatingRound(false);
      }
    },
    [encodedPlanId, loadReviewGraph, selectedRound],
  );

  const handleSaveRoundState = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select an iteration first.');
      return;
    }

    const nextNote = roundNoteDraft.trim();
    const currentNote = (selectedRound.note ?? '').trim();
    const nextConclusion = roundConclusionDraft.trim();
    const currentConclusion = (selectedRound.conclusion ?? '').trim();

    if (roundStatusDraft === 'concluded' && !nextConclusion) {
      setReviewError('Concluded iterations require a non-empty conclusion.');
      return;
    }

    const payload: PlanReviewRoundUpdateRequest = {};
    if (roundStatusDraft !== selectedRound.status) payload.status = roundStatusDraft;
    if (nextNote !== currentNote) payload.note = nextNote;
    if (roundStatusDraft === 'concluded' && nextConclusion !== currentConclusion) {
      payload.conclusion = nextConclusion;
    }

    if (!payload.status && payload.note === undefined && payload.conclusion === undefined) {
      setReviewNotice('No iteration changes to save.');
      return;
    }

    await handleUpdateRound(payload, `Updated iteration #${selectedRound.roundNumber}.`);
  }, [
    handleUpdateRound,
    roundConclusionDraft,
    roundNoteDraft,
    roundStatusDraft,
    selectedRound,
  ]);

  const handleCreateNode = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select an iteration first.');
      return;
    }
    if (selectedRound.status === 'concluded') {
      setReviewError('Iteration is concluded. Re-open it before adding new responses.');
      return;
    }

    const body = newNodeBody.trim();
    if (!body) {
      setReviewError('Response body is required.');
      return;
    }

    if (!newNodeRefTargetId && REVIEW_CAUSAL_RELATIONS.has(newNodeRefRelation)) {
      setReviewError(`Relation '${newNodeRefRelation}' requires a target node.`);
      return;
    }

    setCreatingNode(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const refs: PlanReviewRefInput[] = [];
      const quote = newNodeRefQuote.trim();
      if (newNodeRefTargetId) {
        refs.push({
          relation: newNodeRefRelation,
          target_node_id: newNodeRefTargetId,
          quote: quote || undefined,
        });
      } else {
        const planAnchor = newNodeRefPlanAnchor.trim();
        if (planAnchor) {
          refs.push({
            relation: newNodeRefRelation,
            target_plan_anchor: { label: planAnchor },
            quote: quote || undefined,
          });
        }
      }

      const payload: PlanReviewNodeCreateRequest = {
        round_id: selectedRound.id,
        kind: newNodeKind,
        author_role: newNodeAuthorRole,
        body,
      };
      if (newNodeSeverity) payload.severity = newNodeSeverity;
      if (refs.length > 0) payload.refs = refs;

      const created = await pixsimClient.post<PlanReviewNodeCreateResponse>(
        `/dev/plans/reviews/${encodedPlanId}/nodes`,
        payload,
      );
      setReviewNotice(`Added response node ${created.node.id.slice(0, 8)}.`);
      setNewNodeBody('');
      setNewNodeSeverity('');
      setNewNodeRefRelation('replies_to');
      setNewNodeRefTargetId('');
      setNewNodeRefPlanAnchor('');
      setNewNodeRefQuote('');
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to add response node'));
    } finally {
      setCreatingNode(false);
    }
  }, [
    encodedPlanId,
    loadReviewGraph,
    newNodeAuthorRole,
    newNodeBody,
    newNodeKind,
    newNodeRefPlanAnchor,
    newNodeRefQuote,
    newNodeRefRelation,
    newNodeRefTargetId,
    newNodeSeverity,
    selectedRound,
  ]);

  const handleCreateRequest = useCallback(async () => {
    const title = newRequestTitle.trim();
    const body = newRequestBody.trim();
    if (!title) {
      setReviewError('Request title is required.');
      return;
    }
    if (!body) {
      setReviewError('Request body is required.');
      return;
    }

    setCreatingRequest(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const payload: PlanRequestCreateRequest = {
        title,
        body,
        kind: newRequestKind,
        review_mode: newRequestKind === 'review' ? newRequestMode : undefined,
      };
      if (selectedRound) payload.round_id = selectedRound.id;
      const baseRevisionRaw = newRequestBaseRevision.trim();
      if (baseRevisionRaw) {
        const parsed = Number.parseInt(baseRevisionRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          setReviewError('Base revision must be a positive integer.');
          return;
        }
        payload.base_revision = parsed;
      } else if (newRequestMode !== 'review_only') {
        setReviewError('Base revision is required for propose_patch/apply_patch modes.');
        return;
      }

      if (newRequestAssignee === 'auto') {
        payload.target_mode = 'auto';
      } else {
        const parsed = parseAssigneeOptionValue(newRequestAssignee);
        if (parsed?.kind === 'live') {
          const selectedLiveAssignee = liveAssigneeOptions.find((option) => option.agentId === parsed.id);
          if (
            selectedLiveAssignee
            && typeof selectedLiveAssignee.targetUserId === 'number'
            && selectedLiveAssignee.targetUserId > 0
          ) {
            payload.target_user_id = selectedLiveAssignee.targetUserId;
          }
          // Store as preference - dispatcher re-checks availability at dispatch time
          payload.target_mode = 'auto';
          payload.preferred_agent_id = parsed.id;
        } else if (parsed?.kind === 'recent') {
          payload.target_mode = 'auto';
          payload.preferred_agent_id = parsed.id;
        } else {
          payload.target_mode = 'auto';
        }
      }

      payload.queue_if_busy = newRequestQueuePolicy === 'queue_next';
      payload.auto_reroute_if_busy = newRequestQueuePolicy === 'auto_reroute';
      const targetProfileId = newRequestProfileId.trim();
      if (targetProfileId) payload.target_profile_id = targetProfileId;

      const created = await pixsimClient.post<PlanRequest>(
        `/dev/plans/reviews/${encodedPlanId}/requests`,
        payload,
      );
      setNewRequestTitle('');
      setNewRequestBody('');
      setNewRequestAssignee('auto');
      setNewRequestProfileId('');
      setNewRequestKind('review');
      setNewRequestMode('review_only');
      setNewRequestBaseRevision('');

      // Auto-dispatch when assignee is "auto" (idle agent dispatch)
      if (newRequestAssignee === 'auto' && created.status === 'open') {
        try {
          const result = await pixsimClient.post<PlanRequestDispatchResponse>(
            `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(created.id)}/dispatch`,
            { timeout_seconds: 240, create_round_if_missing: true, spawn_if_missing: false },
          );
          const nodeSuffix = result.node ? ` (node ${result.node.id.slice(0, 8)})` : '';
          setReviewNotice(`Task created & dispatched: ${result.message}${nodeSuffix}`);
        } catch {
          setReviewNotice('Task created but auto-dispatch failed - dispatch manually.');
        }
      } else {
        const dispatchLabel = created.dispatchState ? ` (${created.dispatchState})` : '';
        setReviewNotice(`Agent task created${dispatchLabel}.`);
      }
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create agent task'));
    } finally {
      setCreatingRequest(false);
    }
  }, [
    encodedPlanId,
    liveAssigneeOptions,
    loadReviewGraph,
    newRequestBody,
    newRequestAssignee,
    newRequestKind,
    newRequestMode,
    newRequestProfileId,
    newRequestQueuePolicy,
    newRequestBaseRevision,
    newRequestTitle,
    selectedRound,
  ]);

  const handleUpdateRequestStatus = useCallback(
    async (request: PlanRequest, status: ReviewRequestStatus) => {
      if (request.status === status) return;
      setUpdatingRequestId(request.id);
      setReviewError('');
      setReviewNotice(null);
      try {
        const payload: PlanRequestUpdateRequest = { status };
        if (status === 'fulfilled' && !request.resolutionNote) {
          payload.resolution_note = `Marked fulfilled on ${new Date().toISOString()}`;
        }
        await pixsimClient.patch<PlanRequest>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}`,
          payload,
        );
        setReviewNotice(`Agent task '${request.title}' set to ${status}.`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to update agent task'));
      } finally {
        setUpdatingRequestId(null);
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDismissRequest = useCallback(
    async (request: PlanRequest) => {
      if (request.status === 'in_progress') return;
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanRequest>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}`,
          { dismissed: true },
        );
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to dismiss agent task'));
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDispatchRequest = useCallback(
    async (request: PlanRequest) => {
      if (request.status !== 'open') return;
      setDispatchingRequestId(request.id);
      setReviewError('');
      setReviewNotice(null);
      try {
        const payload: PlanRequestDispatchRequest = {
          timeout_seconds: 240,
          create_round_if_missing: true,
          spawn_if_missing: false,
        };
        const result = await pixsimClient.post<PlanRequestDispatchResponse>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}/dispatch`,
          payload,
        );
        const nodeSuffix = result.node ? ` (node ${result.node.id.slice(0, 8)})` : '';
        setReviewNotice(`${result.message}${nodeSuffix}`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to dispatch agent task'));
      } finally {
        setDispatchingRequestId(null);
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDispatchTick = useCallback(async () => {
    setDispatchingTick(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const result = await pixsimClient.post<PlanReviewDispatchTickResponse>(
        '/dev/plans/reviews/dispatch/tick',
        {
          plan_id: planId,
          limit: 5,
          timeout_seconds: 240,
          create_round_if_missing: true,
          spawn_if_missing: false,
        },
      );
      setReviewNotice(`Dispatch tick: processed ${result.processed}/${result.attempted} open tasks.`);
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to dispatch open agent tasks'));
    } finally {
      setDispatchingTick(false);
    }
  }, [loadReviewGraph, planId]);

  const handleReplyToNode = useCallback((node: PlanReviewNode) => {
    setNewNodeKind('agent_response');
    setNewNodeAuthorRole('agent');
    setNewNodeRefTargetId(node.id);
    setNewNodeRefPlanAnchor('');
    setNewNodeRefRelation('replies_to');
    setReviewNotice(`Reply target set to ${node.id.slice(0, 8)}.`);
    setTimeout(() => composeTextareaRef.current?.focus(), 0);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading plan..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Failed to load plan" description={error} icon={<Icon name="alertCircle" size={20} />} />
      </div>
    );
  }

  if (!detail) return null;

  const pointProgressRows = detail.checkpoints
    ?.map((cp) => getCheckpointPointProgress(cp))
    .filter((progress): progress is { done: number; total: number } => progress !== null) ?? [];
  const donePoints = pointProgressRows.reduce((sum, progress) => sum + progress.done, 0);
  const totalPoints = pointProgressRows.reduce((sum, progress) => sum + progress.total, 0);
  const overallPointsProgress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : null;
  const totalSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.length ?? 0), 0) ?? 0;
  const doneSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.filter((s) => s.done).length ?? 0), 0) ?? 0;
  const overallStepProgress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : null;
  const overallProgress = overallPointsProgress ?? overallStepProgress;
  const overallProgressLabel = overallPointsProgress !== null
    ? `${donePoints}/${totalPoints} pts`
    : `${doneSteps}/${totalSteps} steps`;

  const statusOptions = [
    { value: 'active', label: 'Active', color: 'green' as const },
    { value: 'parked', label: 'Parked', color: 'gray' as const },
    { value: 'done', label: 'Done', color: 'blue' as const },
    { value: 'blocked', label: 'Blocked', color: 'red' as const },
  ];

  const priorityOptions = [
    { value: 'high', label: 'High', color: 'red' as const },
    { value: 'normal', label: 'Normal', color: 'orange' as const },
    { value: 'low', label: 'Low', color: 'gray' as const },
  ];
  const stageBadgeOptions = stageOptions.map((stage) => ({
    value: stage.value,
    label: stage.label,
    color: STAGE_BADGE_COLORS[stage.value] ?? 'gray',
  }));
  const stageLabel = stageLabelFromValue(detail.stage, stageOptionsByValue);

  return (
    <div className="p-4 space-y-4">
      {/* Plan lineage - parent -> this -> children */}
      {(detail.parentId || detail.children.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap text-[10px]">
          {detail.parentId && (
            <>
              <button
                type="button"
                onClick={() => onNavigatePlan?.(detail.parentId!)}
                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[150px]"
                title={detail.parentId}
              >
                {detail.parentId}
              </button>
              <Icon name="chevronRight" size={10} className="text-neutral-400 shrink-0" />
            </>
          )}
          <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[200px]">
            {detail.title}
          </span>
          {detail.children.map((child) => (
            <span key={child.id} className="flex items-center gap-1">
              <Icon name="chevronRight" size={10} className="text-neutral-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigatePlan?.(child.id)}
                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[150px]"
                title={`${child.title} (${child.status})`}
              >
                {child.title}
              </button>
              <Badge color={STATUS_COLORS[child.status] ?? 'gray'} className="text-[9px]">{child.status}</Badge>
            </span>
          ))}
        </div>
      )}

      {/* Header with clickable status/priority badges */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {detail.title}
          </h2>
          <ClickableBadge
            value={detail.status}
            color={STATUS_COLORS[detail.status] ?? 'gray'}
            options={statusOptions}
            onSelect={(v) => void applyUpdate({ status: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.priority}
            color={PRIORITY_COLORS[detail.priority] ?? 'gray'}
            options={priorityOptions}
            onSelect={(v) => void applyUpdate({ priority: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.stage}
            displayValue={stageLabel}
            color={STAGE_BADGE_COLORS[detail.stage] ?? 'gray'}
            options={stageBadgeOptions}
            onSelect={(v) => void applyUpdate({ stage: v })}
            disabled={updating}
          />
          <Badge color="gray" className="text-[10px]">{detail.planType}</Badge>
          {detail.visibility !== 'public' && (
            <Badge color={detail.visibility === 'private' ? 'orange' : 'blue'} className="text-[10px]">
              {detail.visibility}
            </Badge>
          )}
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">{detail.summary}</div>
        {lastResult && (
          <div className={`text-xs mt-1 ${lastResult.startsWith('Failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
            {lastResult}
          </div>
        )}
      </div>

      {/* Compact metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <Icon name="user" size={11} className="text-neutral-400" />
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.owner}</span>
        </span>
        <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
        <span>Stage: <span className="font-medium text-neutral-700 dark:text-neutral-300">{stageLabel}</span></span>
        {overallProgress !== null ? (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
            <span>{overallProgress}% <span className="text-neutral-400">({overallProgressLabel})</span></span>
          </>
        ) : (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
            <span>{detail.scope}</span>
          </>
        )}
        <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
        <span>{formatDate(detail.lastUpdated)}</span>
      </div>

      {(loadingParticipants || (planParticipants?.participants.length ?? 0) > 0) && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
          <SectionHeader
            trailing={(
              <span className="text-[10px] text-neutral-400">
                {loadingParticipants
                  ? 'Refreshing...'
                  : `${planParticipants?.participants.length ?? 0} tracked`}
              </span>
            )}
          >
            Participants
          </SectionHeader>
          {!loadingParticipants && (planParticipants?.participants.length ?? 0) === 0 ? (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              No attributed participants yet.
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Builders ({builderParticipants.length})
                </div>
                <div className="space-y-1">
                  {builderParticipants.map((participant) => (
                    <ParticipantEntry
                      key={participant.id}
                      participant={participant}
                      profileLabels={reviewProfileLabels}
                      open={openParticipantId === participant.id}
                      onToggle={() => setOpenParticipantId((prev) => prev === participant.id ? null : participant.id)}
                    />
                  ))}
                  {builderParticipants.length === 0 && (
                    <div className="text-[11px] text-neutral-400">None</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Reviewers ({reviewerParticipants.length})
                </div>
                <div className="space-y-1">
                  {reviewerParticipants.map((participant) => (
                    <ParticipantEntry
                      key={participant.id}
                      participant={participant}
                      profileLabels={reviewProfileLabels}
                      open={openParticipantId === participant.id}
                      onToggle={() => setOpenParticipantId((prev) => prev === participant.id ? null : participant.id)}
                    />
                  ))}
                  {reviewerParticipants.length === 0 && (
                    <div className="text-[11px] text-neutral-400">None</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Target */}
      {detail.target && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
          <SectionHeader>Target</SectionHeader>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <Badge color="blue" className="text-[10px]">{detail.target.type}</Badge>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.target.id}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">{detail.target.description}</div>
          {detail.target.paths && detail.target.paths.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {detail.target.paths.map((p) => (
                <div key={p} className="text-[10px] text-neutral-400 font-mono">{p}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkpoints */}
      {detail.checkpoints && detail.checkpoints.length > 0 && (
        <CheckpointList checkpoints={detail.checkpoints} forgeUrlTemplate={forgeUrlTemplate} />
      )}

      {/* Tags */}
      {detail.tags.length > 0 && (
        <div>
          <SectionHeader>Tags</SectionHeader>
          <div className="flex flex-wrap gap-1 mt-1">
            {detail.tags.map((tag) => (
              <Badge key={tag} color="gray" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Code paths */}
      {detail.codePaths.length > 0 && (
        <div>
          <SectionHeader>Code Paths ({detail.codePaths.length})</SectionHeader>
          <div className="mt-1 space-y-0.5">
            {detail.codePaths.map((p) => (
              <div key={p} className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Companions & Handoffs & Dependencies */}
      {(detail.companions.length > 0 || detail.handoffs.length > 0 || detail.dependsOn.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {detail.companions.length > 0 && (
            <div>
              <SectionHeader>Companions ({detail.companions.length})</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.companions.map((c) => (
                  <div key={c} className="text-xs text-neutral-600 dark:text-neutral-400">{c}</div>
                ))}
              </div>
            </div>
          )}
          {detail.handoffs.length > 0 && (
            <div>
              <SectionHeader>Handoffs ({detail.handoffs.length})</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.handoffs.map((h) => (
                  <div key={h} className="text-xs text-neutral-600 dark:text-neutral-400">{h}</div>
                ))}
              </div>
            </div>
          )}
          {detail.dependsOn.length > 0 && (
            <div>
              <SectionHeader>Depends On</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.dependsOn.map((d) => (
                  <div key={d} className="text-xs text-neutral-600 dark:text-neutral-400">{d}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-plans moved to lineage bar at top */}

      {/* Test Coverage */}
      {coverage && (coverage.explicit_suites.length > 0 || coverage.auto_discovered.length > 0) && (
        <DisclosureSection
          label="Test Coverage"
          defaultOpen={false}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
          contentClassName="space-y-2 mt-2"
          badge={
            <span className="text-[10px] text-neutral-400">
              {coverage.explicit_suites.length + coverage.auto_discovered.length} suite{coverage.explicit_suites.length + coverage.auto_discovered.length !== 1 ? 's' : ''}
            </span>
          }
        >
          {coverage.explicit_suites.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Linked suites
              </div>
              <div className="flex flex-wrap gap-1">
                {coverage.explicit_suites.map((id) => (
                  <Badge key={id} color="purple" className="text-[9px]">{id}</Badge>
                ))}
              </div>
            </div>
          )}
          {coverage.auto_discovered.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Auto-discovered ({coverage.auto_discovered.length})
              </div>
              <div className="space-y-1">
                {coverage.auto_discovered.map((suite) => (
                  <div key={suite.suite_id} className="flex items-start gap-2 text-[11px]">
                    <Badge color="green" className="text-[9px] shrink-0">{suite.kind || 'test'}</Badge>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{suite.suite_label}</span>
                      {suite.matched_paths.length > 0 && (
                        <div className="text-[9px] text-neutral-400 truncate">
                          {suite.matched_paths[0]}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {coverage.code_paths.length > 0 && (
            <div className="text-[9px] text-neutral-400 mt-1">
              Scanning {coverage.code_paths.length} code path{coverage.code_paths.length !== 1 ? 's' : ''}
            </div>
          )}
        </DisclosureSection>
      )}

      <DisclosureSection
        label="Agent Tasks"
        defaultOpen={false}
        onToggle={onReviewSectionToggle}
        className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
        contentClassName="space-y-3 mt-2"
        badge={
          <span className="text-[10px] text-neutral-400">
            {reviewGraph
              ? `${reviewGraph.rounds.length} iterations`
              : `${detail?.reviewRoundCount ?? 0} iterations`}
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void loadReviewGraph()} disabled={loadingReviews}>
            {loadingReviews ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >

        {reviewError && (
          <div className="text-xs text-red-600 dark:text-red-400">
            {reviewError}
          </div>
        )}
        {reviewNotice && !reviewError && (
          <div className="text-xs text-green-600 dark:text-green-400">
            {reviewNotice}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="space-y-3">
            <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2">
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Iterations
              </div>
              {loadingReviews && reviewRounds.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Loading task data...</div>
              ) : reviewRounds.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">No iterations yet.</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {reviewRounds.map((round) => {
                    const selected = round.id === selectedRoundId;
                    return (
                      <button
                        key={round.id}
                        onClick={() => setSelectedRoundId(round.id)}
                        className={`w-full text-left p-2 rounded border text-xs ${
                          selected
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            Iteration #{round.roundNumber}
                          </span>
                          <Badge color={REVIEW_ROUND_STATUS_COLORS[round.status]} className="text-[9px]">
                            {round.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {reviewNodeCountByRound.get(round.id) ?? 0} entries
                          {round.reviewRevision != null ? ` - rev ${round.reviewRevision}` : ''}
                        </div>
                        {(round.actorAgentId || round.actorRunId || round.createdBy) && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {formatActorLabel(
                              {
                                principalType: round.actorPrincipalType,
                                userId: round.actorUserId,
                                agentId: round.actorAgentId,
                                fallback: round.createdBy,
                              },
                              { profileLabels: reviewProfileLabels },
                            )}
                            {round.actorRunId ? ` - run ${round.actorRunId.slice(0, 16)}` : ''}
                          </div>
                        )}
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          {formatDateTime(round.updatedAt)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DisclosureSection
              label="Start New Iteration"
              defaultOpen={false}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
              contentClassName="space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Status
                  <select
                    value={newRoundStatus}
                    onChange={(e) => setNewRoundStatus(e.target.value as 'open' | 'changes_requested' | 'approved')}
                    className={inputClassName}
                  >
                    <option value="open">open</option>
                    <option value="changes_requested">changes_requested</option>
                    <option value="approved">approved</option>
                  </select>
                </label>
                <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Revision
                  <input
                    value={newRoundRevision}
                    onChange={(e) => setNewRoundRevision(e.target.value)}
                    className={inputClassName}
                    placeholder="optional"
                  />
                </label>
              </div>
              <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
                Note
                <input
                  value={newRoundNote}
                  onChange={(e) => setNewRoundNote(e.target.value)}
                  className={inputClassName}
                  placeholder="Optional context for this iteration"
                />
              </label>
              <Button size="sm" onClick={() => void handleCreateRound()} disabled={creatingRound}>
                {creatingRound ? 'Creating...' : 'Create Iteration'}
              </Button>
            </DisclosureSection>
          </div>

          <div className="space-y-3 xl:col-span-2">
            <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {selectedRound ? `Iteration #${selectedRound.roundNumber}` : 'Iteration State'}
                </span>
                {selectedRound && (
                  <Badge color={REVIEW_ROUND_STATUS_COLORS[selectedRound.status]} className="text-[9px]">
                    {selectedRound.status}
                  </Badge>
                )}
                {selectedRound?.reviewRevision != null && (
                  <Badge color="gray" className="text-[9px]">
                    rev {selectedRound.reviewRevision}
                  </Badge>
                )}
              </div>

              {!selectedRound ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Select an iteration to inspect responses.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      Status
                      <select
                        value={roundStatusDraft}
                        onChange={(e) => setRoundStatusDraft(e.target.value as ReviewRoundStatus)}
                        className={inputClassName}
                      >
                        <option value="open">open</option>
                        <option value="changes_requested">changes_requested</option>
                        <option value="approved">approved</option>
                        <option value="concluded">concluded</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400 sm:col-span-2">
                      Note
                      <input
                        value={roundNoteDraft}
                        onChange={(e) => setRoundNoteDraft(e.target.value)}
                        className={inputClassName}
                        placeholder="Optional iteration note"
                      />
                    </label>
                  </div>

                  <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
                    Conclusion (required when status=concluded)
                    <textarea
                      value={roundConclusionDraft}
                      onChange={(e) => setRoundConclusionDraft(e.target.value)}
                      className={textAreaClassName}
                      rows={2}
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void handleSaveRoundState()} disabled={updatingRound}>
                      {updatingRound ? 'Saving...' : 'Save Iteration State'}
                    </Button>
                    <span className="text-[10px] text-neutral-400">
                      Updated {formatDateTime(selectedRound.updatedAt)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <DisclosureSection
              label="Agent Tasks"
              defaultOpen
              className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
              contentClassName="space-y-2"
              badge={
                <Badge color="gray" className="text-[9px]">{selectedRoundRequests.length}</Badge>
              }
              actions={
                <Button
                  size="sm"
                  onClick={() => void handleDispatchTick()}
                  disabled={dispatchingTick || !selectedRoundRequests.some((request) => request.status === 'open')}
                >
                  {dispatchingTick ? 'Dispatching...' : 'Dispatch Open'}
                </Button>
              }
            >

              {selectedRoundRequests.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  No agent tasks yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedRoundRequests.filter((r) => !r.dismissed).map((request) => (
                    <PlanReviewRequestCard
                      key={request.id}
                      request={request}
                      profileLabels={reviewProfileLabels}
                      requestStatusColors={REVIEW_REQUEST_STATUS_COLORS}
                      requestDispatchColors={REVIEW_REQUEST_DISPATCH_COLORS}
                      agentSessions={agentSessions}
                      nodeById={nodeById}
                      selectedRoundNodeOrder={selectedRoundNodeOrder}
                      dispatchingRequestId={dispatchingRequestId}
                      updatingRequestId={updatingRequestId}
                      onDispatchRequest={handleDispatchRequest}
                      onUpdateRequestStatus={handleUpdateRequestStatus}
                      onDismissRequest={handleDismissRequest}
                      onFocusNode={focusLinkedNode}
                      formatDateTime={formatDateTime}
                    />
                  ))}
                </div>
              )}

              <PlanReviewRequestForm
                inputClassName={inputClassName}
                textAreaClassName={textAreaClassName}
                title={newRequestTitle}
                body={newRequestBody}
                profileId={newRequestProfileId}
                kind={newRequestKind}
                mode={newRequestMode}
                baseRevision={newRequestBaseRevision}
                assignee={newRequestAssignee}
                queuePolicy={newRequestQueuePolicy}
                creating={creatingRequest}
                loadingAssignees={loadingAssignees}
                loadingProfiles={loadingProfiles}
                profiles={reviewProfiles}
                liveAssignees={liveAssigneeOptions}
                recentAssignees={recentAssigneeOptions}
                profileLabels={reviewProfileLabels}
                buildAssigneeOptionValue={buildAssigneeOptionValue}
                onTitleChange={setNewRequestTitle}
                onBodyChange={setNewRequestBody}
                onProfileChange={applyRequestProfileSelection}
                onKindChange={setNewRequestKind}
                onModeChange={setNewRequestMode}
                onBaseRevisionChange={setNewRequestBaseRevision}
                onAssigneeChange={setNewRequestAssignee}
                onQueuePolicyChange={setNewRequestQueuePolicy}
                onSubmit={() => void handleCreateRequest()}
              />
            </DisclosureSection>

            <DisclosureSection
              label="Discussion"
              defaultOpen
              className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
              contentClassName="space-y-2"
              badge={
                <Badge color="gray" className="text-[9px]">{selectedRoundNodes.length}</Badge>
              }
            >
              {!selectedRound ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Select an iteration to view discussion.
                </div>
              ) : selectedRoundNodes.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  No responses yet in this iteration.
                </div>
              ) : (
                <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                  <PlanReviewDiscussion
                    roots={selectedRoundThread.roots}
                    childrenByParent={selectedRoundThread.childrenByParent}
                    threadRefByChild={selectedRoundThreadRefByChild}
                    linksBySource={selectedRoundLinksBySource}
                    selectedRoundId={selectedRoundId}
                    nodeById={nodeById}
                    nodeOrderById={selectedRoundNodeOrder}
                    roundNumberById={reviewRoundNumberById}
                    focusedNodeId={focusedNodeId}
                    dismissedNodeIds={dismissedNodeIds}
                    sourcePreview={sourcePreview}
                    sourcePreviewError={sourcePreviewError}
                    sourcePreviewLoadingKey={sourcePreviewLoadingKey}
                    nodeCardRefs={nodeCardRefs}
                    profileLabels={reviewProfileLabels}
                    authorRoleColors={REVIEW_AUTHOR_ROLE_COLORS}
                    severityColors={REVIEW_SEVERITY_COLORS}
                    formatDateTime={formatDateTime}
                    formatReviewRelation={formatReviewRelation}
                    extractSourceRefs={extractSourceRefs}
                    onPreviewSourceRef={previewSourceRef}
                    onClearSourcePreview={() => setSourcePreview(null)}
                    onFocusLinkedNode={focusLinkedNode}
                    onReplyToNode={handleReplyToNode}
                  />
                </div>
              )}
            </DisclosureSection>

            <PlanReviewResponseForm
              inputClassName={inputClassName}
              textAreaClassName={textAreaClassName}
              selectedRoundStatus={selectedRound?.status ?? null}
              selectedRoundNodes={selectedRoundNodes}
              relationOptions={relationOptions}
              composeTextareaRef={composeTextareaRef}
              kind={newNodeKind}
              authorRole={newNodeAuthorRole}
              severity={newNodeSeverity}
              body={newNodeBody}
              refTargetId={newNodeRefTargetId}
              refRelation={newNodeRefRelation}
              refPlanAnchor={newNodeRefPlanAnchor}
              refQuote={newNodeRefQuote}
              creating={creatingNode}
              onKindChange={setNewNodeKind}
              onAuthorRoleChange={setNewNodeAuthorRole}
              onSeverityChange={setNewNodeSeverity}
              onBodyChange={setNewNodeBody}
              onRefTargetIdChange={setNewNodeRefTargetId}
              onRefRelationChange={setNewNodeRefRelation}
              onRefPlanAnchorChange={setNewNodeRefPlanAnchor}
              onRefQuoteChange={setNewNodeRefQuote}
              onSubmit={() => void handleCreateNode()}
            />
          </div>
        </div>
      </DisclosureSection>

      {/* Parent reference moved to lineage bar at top */}

      {/* Plan markdown - collapsed by default */}
      {detail.markdown && (
        <div>
          <button
            onClick={() => setPlanExpanded((e) => !e)}
            className="flex items-center gap-1.5 w-full text-left group"
          >
            <Icon
              name="chevronRight"
              size={12}
              className={`text-neutral-400 transition-transform ${planExpanded ? 'rotate-90' : ''}`}
            />
            <SectionHeader
              trailing={
                <code className="text-[10px] text-neutral-400">{detail.planPath}</code>
              }
            >
              Full Plan
            </SectionHeader>
          </button>
          {planExpanded && (
            <pre className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs whitespace-pre-wrap overflow-auto max-h-[32rem] leading-relaxed">
              {detail.markdown}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PlansPanel({ context }: { context?: { targetPlanId?: string; [key: string]: any } }) {
  const { theme: variant } = useTheme();

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'stage' | 'updated' | 'priority' | 'title'>('stage');
  const [showDocs, setShowDocs] = useState(false);
  const [companionDocs, setCompanionDocs] = useState<{ id: string; title: string; namespace: string | null }[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('plans-panel:pinned');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const togglePin = useCallback((planId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId); else next.add(planId);
      localStorage.setItem('plans-panel:pinned', JSON.stringify([...next]));
      return next;
    });
  }, []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [forgeUrlTemplate, setForgeUrlTemplate] = useState<string | null>(null);
  const [stageOptions, setStageOptions] = useState<PlanStageOptionEntry[]>(
    FALLBACK_PLAN_STAGE_OPTIONS,
  );
  const stageOptionsByValue = useMemo(
    () => new Map(stageOptions.map((stage) => [stage.value, stage])),
    [stageOptions],
  );

  // Fetch forge commit URL template once
  useEffect(() => {
    pixsimClient
      .get<{ forgeCommitUrlTemplate?: string | null }>('/dev/plans/settings')
      .then((res) => {
        if (res.forgeCommitUrlTemplate) setForgeUrlTemplate(res.forgeCommitUrlTemplate);
      })
      .catch(() => {/* non-critical */});
  }, []);

  // Fetch canonical stage options once; keep fallback for older backends.
  useEffect(() => {
    pixsimClient
      .get<PlanStagesResponse>('/dev/plans/stages')
      .then((res) => {
        if (Array.isArray(res.stages) && res.stages.length > 0) {
          setStageOptions(res.stages);
        }
      })
      .catch(() => {/* non-critical */});
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await pixsimClient.get<PlansIndexResponse>('/dev/plans?refresh=true');
      const canonicalPlans = res.plans.filter((p) => isCanonicalPlanId(p.id));
      if (canonicalPlans.length !== res.plans.length) {
        console.warn('PlansPanel: dropped non-canonical plan IDs from sidebar list');
      }
      setPlans(canonicalPlans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, refreshKey]);

  // Load companion docs when toggled on
  useEffect(() => {
    if (!showDocs) return;
    pixsimClient
      .get<{ documents: { id: string; title: string; namespace: string | null }[] }>(
        '/dev/plans/documents', { params: { namespace_prefix: 'plans/', limit: 200 } },
      )
      .then((res) => setCompanionDocs(res.documents ?? []))
      .catch(() => setCompanionDocs([]));
  }, [showDocs, refreshKey]);

  const handlePlanChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Filter and sort plans
  const filteredPlans = useMemo(() => {
    let result = plans;
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.owner.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (sortBy === 'updated') {
      result = [...result].sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
    } else if (sortBy === 'priority') {
      const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
      result = [...result].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
    } else if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }
    return result;
  }, [plans, statusFilter, searchQuery, sortBy]);

  // Status filter pills
  const statusOptions = useMemo<FilterPillOption<string>[]>(() => {
    const counts = new Map<string, number>();
    for (const p of plans) {
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    }
    return STATUS_ORDER
      .filter((s) => counts.has(s))
      .map((s) => ({ value: s, label: s, count: counts.get(s) }));
  }, [plans]);

  // Group filtered plans by stage for sidebar sections, with parent-child nesting.
  // Child plans (parentId set) are excluded from top-level and placed after their parent.
  const grouped = useMemo(() => {
    const map = new Map<string, PlanSummary[]>();
    const childOf = new Map<string, PlanSummary[]>(); // parentId -> children

    for (const p of filteredPlans) {
      if (p.parentId) {
        if (!childOf.has(p.parentId)) childOf.set(p.parentId, []);
        childOf.get(p.parentId)!.push(p);
      } else {
        const key = p.stage || p.status;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }
    }
    return { byStage: map, childOf };
  }, [filteredPlans]);

  // Build sidebar sections - grouped by stage, with children nested under parent
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const result: SidebarContentLayoutSection[] = [];

    // Use stage order first, then fall back to status order for any remaining groups
    const allKeys = new Set([...grouped.byStage.keys()]);
    const orderedKeys: string[] = [];
    for (const s of stageOptions.map((stage) => stage.value)) {
      if (allKeys.has(s)) { orderedKeys.push(s); allKeys.delete(s); }
    }
    for (const s of STATUS_ORDER) {
      if (allKeys.has(s)) { orderedKeys.push(s); allKeys.delete(s); }
    }
    // Any remaining (unknown stages)
    for (const s of allKeys) orderedKeys.push(s);

    const makePlanEntry = (p: PlanSummary, groupKey: string, indented = false) => {
      const reviewCount = p.reviewRoundCount ?? 0;
      const activeReviews = p.activeReviewRoundCount ?? 0;
      const daysSinceUpdate = p.lastUpdated
        ? Math.floor((Date.now() - new Date(p.lastUpdated).getTime()) / 86400000)
        : null;
      const isFresh = daysSinceUpdate !== null && daysSinceUpdate <= 1;
      const isPinned = pinnedIds.has(p.id);

      return {
        id: `plan:${p.id}`,
        label: indented ? `  ${p.title}` : p.title,
        icon: (
          <span className="relative flex items-center justify-center">
            {indented
              ? <Icon name="git-branch" size={9} className="text-neutral-500" />
              : <Icon name={(PLAN_TYPE_ICONS[p.planType] ?? 'fileText') as any} size={11} />
            }
            <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASSES[p.status] ?? 'bg-neutral-400'}`} />
          </span>
        ),
        extra: (
          <span className="flex items-center gap-1.5">
            <span
              className={`cursor-pointer ${isPinned ? '' : 'opacity-0 group-hover/child:opacity-40'} hover:!opacity-100`}
              onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
              title={isPinned ? 'Unpin' : 'Pin to top'}
            >
              <Icon name="pin" size={8} />
            </span>
            {isFresh && (
              <span title={`Updated ${p.lastUpdated}`}>
                <Icon name="zap" size={9} />
              </span>
            )}
            {reviewCount > 0 && (
              <span
                className={`flex items-center gap-0.5 ${activeReviews > 0 ? '' : 'opacity-50'}`}
                title={`${reviewCount} iteration${reviewCount !== 1 ? 's' : ''}${activeReviews > 0 ? ` (${activeReviews} active)` : ' (all concluded)'}`}
              >
                <Icon name="messageSquare" size={9} />
                <span className="text-[9px] leading-none">
                  {activeReviews > 0 ? `${activeReviews}/${reviewCount}` : reviewCount}
                </span>
              </span>
            )}
            {p.priority === 'high' && (
              <span title="High priority">
                <Icon name="alertCircle" size={9} />
              </span>
            )}
            {p.priority === 'medium' && (
              <span className="opacity-60" title="Medium priority">
                <Icon name="alertCircle" size={9} />
              </span>
            )}
            {sortBy === 'stage' && !indented && STAGE_ICONS[p.stage] && p.stage !== groupKey && (
              <span className="opacity-50" title={p.stage}>
                <Icon name={STAGE_ICONS[p.stage] as any} size={8} />
              </span>
            )}
            {sortBy !== 'stage' && STAGE_ICONS[p.stage] && (
              <span className="opacity-50" title={p.stage}>
                <Icon name={STAGE_ICONS[p.stage] as any} size={8} />
              </span>
            )}
          </span>
        ),
      };
    };

    // Separate pinned plans
    const pinnedPlans = filteredPlans.filter((p) => pinnedIds.has(p.id));
    const unpinnedPlans = filteredPlans.filter((p) => !pinnedIds.has(p.id));

    // Pinned section (always shown if any pinned)
    if (pinnedPlans.length > 0) {
      result.push({
        id: 'pinned',
        label: `Pinned (${pinnedPlans.length})`,
        icon: <Icon name="pin" size={12} />,
        children: pinnedPlans.map((p) => makePlanEntry(p, '', false)),
      });
    }

    if (sortBy !== 'stage') {
      // Flat sorted list - no stage groups
      const topLevel = unpinnedPlans.filter((p) => !p.parentId);
      if (topLevel.length > 0) {
        const children: { id: string; label: string; icon: React.ReactNode; extra: React.ReactNode }[] = [];
        for (const p of topLevel) {
          children.push(makePlanEntry(p, '', false));
          const subPlans = grouped.childOf.get(p.id);
          if (subPlans) {
            for (const child of subPlans) {
              children.push(makePlanEntry(child, '', true));
            }
          }
        }
        result.push({
          id: 'sorted',
          label: `Plans (${topLevel.length})`,
          icon: <Icon name="list" size={12} />,
          children,
        });
      }
    } else {
      // Grouped by stage
      for (const key of orderedKeys) {
        const stagePlans = (grouped.byStage.get(key) ?? []).filter((p) => !pinnedIds.has(p.id));
        if (stagePlans.length === 0) continue;

        let totalCount = stagePlans.length;
        for (const p of stagePlans) totalCount += (grouped.childOf.get(p.id)?.length ?? 0);

        const children: { id: string; label: string; icon: React.ReactNode; extra: React.ReactNode }[] = [];
        for (const p of stagePlans) {
          children.push(makePlanEntry(p, key, false));
          const subPlans = grouped.childOf.get(p.id);
          if (subPlans) {
            for (const child of subPlans) {
              children.push(makePlanEntry(child, key, true));
            }
          }
        }

        const stageLabel = stageLabelFromValue(key, stageOptionsByValue);
        result.push({
          id: `stage:${key}`,
          label: `${stageLabel} (${totalCount})`,
          icon: <Icon name={(STAGE_ICONS[key] ?? STATUS_ICONS[key] ?? 'circle') as any} size={12} />,
          children,
        });
      }
    }

    // Companion docs section
    if (showDocs && companionDocs.length > 0) {
      result.push({
        id: 'docs',
        label: `Docs (${companionDocs.length})`,
        icon: <Icon name="fileText" size={12} />,
        children: companionDocs.map((doc) => ({
          id: `doc:${doc.id}`,
          label: doc.title,
          icon: <Icon name="fileText" size={10} />,
        })),
      });
    }

    return result;
  }, [grouped, filteredPlans, pinnedIds, sortBy, showDocs, companionDocs, stageOptions, stageOptionsByValue, togglePin]);

  const nav = useSidebarNav({
    sections,
    storageKey: 'plans-panel:nav',
  });

  // Navigate to a specific plan when opened via notification or cross-panel link
  const targetPlanId = context?.targetPlanId;
  useEffect(() => {
    if (!targetPlanId) return;
    const navId = `plan:${targetPlanId}`;
    if (nav.activeId !== navId) {
      nav.navigate(navId);
    }
  }, [targetPlanId]); // eslint-disable-line react-hooks/exhaustive-deps -- only react to context changes

  if (loading && plans.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading plans..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          message="Failed to load plans"
          description={error}
          icon={<Icon name="alertCircle" size={20} />}
          action={<Button size="sm" onClick={loadPlans}>Retry</Button>}
        />
      </div>
    );
  }

  // Resolve content
  const activeId = nav.activeId;
  let content: React.ReactNode;

  if (activeId.startsWith('plan:')) {
    const planId = activeId.slice(5);
    const selectedPlanExists = plans.some((p) => p.id === planId);
    if (!isCanonicalPlanId(planId) || !selectedPlanExists) {
      content = (
        <div className="flex items-center justify-center h-full">
          <EmptyState
            message="Selected plan is unavailable"
            description="Pick a plan from the sidebar."
            icon={<Icon name="alertCircle" size={20} />}
          />
        </div>
      );
    } else {
      content = (
        <PlanDetailView
          key={`${planId}-${refreshKey}`}
          planId={planId}
          onPlanChanged={handlePlanChanged}
          onNavigatePlan={(id) => nav.navigate(`plan:${id}`)}
          forgeUrlTemplate={forgeUrlTemplate}
          stageOptions={stageOptions}
        />
      );
    }
  } else if (activeId.startsWith('stage:') || activeId.startsWith('status:')) {
    const groupKey = activeId.includes(':') ? activeId.slice(activeId.indexOf(':') + 1) : activeId;
    const count = grouped.byStage.get(groupKey)?.length ?? 0;
    const groupLabel = stageLabelFromValue(groupKey, stageOptionsByValue);
    content = (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          message={`${count} ${groupLabel} plan${count !== 1 ? 's' : ''}`}
          description="Select a plan from the sidebar"
          icon={<Icon name={(STAGE_ICONS[groupKey] ?? STATUS_ICONS[groupKey] ?? 'fileText') as any} size={20} />}
        />
      </div>
    );
  } else {
    content = (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Select a plan from the sidebar" icon={<Icon name="fileText" size={20} />} />
      </div>
    );
  }

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      activeChildId={nav.activeChildId}
      onSelectSection={nav.selectSection}
      onSelectChild={nav.selectChild}
      expandedSectionIds={nav.expandedSectionIds}
      onToggleExpand={nav.toggleExpand}
      sidebarTitle={
        <div className="space-y-2">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search plans..."
            size="sm"
          />
          {statusOptions.length > 1 && (
            <FilterPillGroup
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              allLabel="All"
            />
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="w-full text-[10px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-600 dark:text-neutral-300 cursor-pointer"
            title="Sort plans"
          >
            <option value="stage">Sort by stage</option>
            <option value="updated">Sort by recent</option>
            <option value="priority">Sort by priority</option>
            <option value="title">Sort A-Z</option>
          </select>
          <label className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDocs}
              onChange={(e) => setShowDocs(e.target.checked)}
              className="w-3 h-3"
            />
            Docs
          </label>
        </div>
      }
      sidebarWidth="w-52"
      variant={variant}
      collapsible
      resizable
      expandedWidth={208}
      persistKey="plans-panel-sidebar"
      autoHideTitle={false}
      contentClassName="overflow-y-auto"
    >
      {content}
    </SidebarContentLayout>
  );
}
