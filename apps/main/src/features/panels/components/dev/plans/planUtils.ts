/**
 * Pure utility functions for the Plans panel system.
 *
 * Extracted from PlansPanel.tsx for reuse across plan sub-components.
 */

import { PLAN_ID_RE } from './planConstants';
import type {
  PlanReviewLink,
  PlanRevisionConflict,
  PlanStageOptionEntry,
  SourceRefMatch,
} from './planTypes';

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Plan ID / label helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Source reference extraction
// ---------------------------------------------------------------------------

export const SOURCE_REF_RE = /([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+):(\d+)(?:-(\d+))?/g;

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

// ---------------------------------------------------------------------------
// Review relation formatting
// ---------------------------------------------------------------------------

export function formatReviewRelation(relation: PlanReviewLink['relation']): string {
  return relation.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Assignee option encoding
// ---------------------------------------------------------------------------

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
