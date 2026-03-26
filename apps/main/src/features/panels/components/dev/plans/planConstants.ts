/**
 * Constants for the Plans panel system.
 *
 * Extracted from PlansPanel.tsx for reuse across plan sub-components.
 */

import type {
  PlanReviewLink,
  PlanReviewNode,
  PlanStageOptionEntry,
  ReviewAuthorRole,
  ReviewRequestStatus,
  ReviewRoundStatus,
} from './planTypes';

// ---------------------------------------------------------------------------
// Status / stage ordering
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Icon maps
// ---------------------------------------------------------------------------

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
  medium: 'orange',
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

// ---------------------------------------------------------------------------
// Review color maps
// ---------------------------------------------------------------------------

export const REVIEW_ROUND_STATUS_COLORS: Record<ReviewRoundStatus, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  changes_requested: 'orange',
  approved: 'green',
  concluded: 'gray',
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

// ---------------------------------------------------------------------------
// Review relations
// ---------------------------------------------------------------------------

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
