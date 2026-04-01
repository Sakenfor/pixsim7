/**
 * PlanDetailSections — read-only detail sections below the header:
 * participants, target, checkpoints, tags, code paths, companions, handoffs,
 * dependencies, test coverage, plan markdown, and source preview.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import {
  Badge,
  DisclosureSection,
  SectionHeader,
} from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { CheckpointList } from '../PlanCheckpointList';

import type {
  PlanDetail,
  PlanParticipant,
  PlanParticipantsResponse,
  PlanSourcePreviewResponse,
  SourceRefMatch,
} from './types';
import {
  formatDateTime,
  PRIORITY_COLORS,
  STAGE_BADGE_COLORS,
  STATUS_COLORS,
} from './types';

export interface PlanDetailSectionsProps {
  detail: PlanDetail;
  viewMode?: 'full' | 'checkpoints';
  forgeUrlTemplate?: string | null;
  coverage: {
    code_paths: string[];
    explicit_suites: string[];
    auto_discovered: { suite_id: string; suite_label: string; kind: string | null; matched_paths: string[] }[];
  } | null;
  planExpanded: boolean;
  onTogglePlanExpanded: () => void;
  onNavigatePlan?: (planId: string) => void;
  sourcePreview: {
    nodeId: string;
    ref: SourceRefMatch;
    data: PlanSourcePreviewResponse;
  } | null;
  sourcePreviewError: {
    nodeId: string;
    message: string;
  } | null;
  onClearSourcePreview: () => void;
}


export function PlanDetailSections({
  detail,
  viewMode = 'full',
  forgeUrlTemplate,
  coverage,
  planExpanded,
  onTogglePlanExpanded,
}: PlanDetailSectionsProps) {
  const checkpointsOnly = viewMode === 'checkpoints';

  return (
    <>

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

      {checkpointsOnly && (!detail.checkpoints || detail.checkpoints.length === 0) && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-xs text-neutral-500 dark:text-neutral-400">
          No checkpoints on this plan yet.
        </div>
      )}

      {/* Tags */}
      {!checkpointsOnly && detail.tags.length > 0 && (
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
      {!checkpointsOnly && detail.codePaths.length > 0 && (
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
      {!checkpointsOnly && (detail.companions.length > 0 || detail.handoffs.length > 0 || detail.dependsOn.length > 0) && (
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
      {!checkpointsOnly && coverage && (coverage.explicit_suites.length > 0 || coverage.auto_discovered.length > 0) && (
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
              Matched across {coverage.code_paths.length} code path{coverage.code_paths.length !== 1 ? 's' : ''}
            </div>
          )}
        </DisclosureSection>
      )}

      {/* Plan markdown - collapsed by default */}
      {!checkpointsOnly && detail.markdown && (
        <div>
          <button
            onClick={onTogglePlanExpanded}
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
    </>
  );
}

// ── Plan Activity Timeline ──────────────────────────────────────

interface AuditEventEntry {
  id: string;
  domain: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  actor: string | null;
  runId: string | null;
  planId: string | null;
  commitSha: string | null;
  timestamp: string;
  extra: Record<string, unknown> | null;
}

/** Response shape from /dev/plans/registry/{id}/events. */
interface PlanEventsApiResponse {
  planId: string;
  events: {
    id: string;
    runId: string | null;
    planId: string;
    eventType: string;
    entityType: string | null;
    entityLabel: string | null;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    commitSha: string | null;
    actor: string | null;
    timestamp: string;
  }[];
}

/** Normalise plan-specific event entries to the shared AuditEventEntry shape. */
function normalizePlanEvents(res: PlanEventsApiResponse): AuditEventEntry[] {
  return res.events.map((e) => ({
    id: e.id,
    domain: 'plan',
    entityType: e.entityType ?? 'plan_registry',
    entityId: e.planId,
    entityLabel: e.entityLabel,
    action: e.eventType,
    field: e.field,
    oldValue: e.oldValue,
    newValue: e.newValue,
    actor: e.actor,
    runId: e.runId,
    planId: e.planId,
    commitSha: e.commitSha,
    timestamp: e.timestamp,
    extra: null,
  }));
}

const ACTOR_ICONS: Record<string, string> = {
  user: 'user',
  agent: 'cpu',
  service: 'zap',
};

function actorIcon(actor: string | null): string {
  if (!actor) return 'activity';
  const prefix = actor.split(':')[0];
  return ACTOR_ICONS[prefix] ?? 'activity';
}

function actorLabel(actor: string | null): string {
  if (!actor) return 'system';
  // "user:1" → "user:1", "agent:profile-xyz" → "agent:profile-xyz"
  // Trim to a readable short form
  const parts = actor.split(':');
  if (parts.length >= 2) {
    const prefix = parts[0];
    const id = parts.slice(1).join(':');
    if (prefix === 'agent') return id.length > 20 ? `${id.slice(0, 18)}...` : id;
    return actor;
  }
  return actor;
}

/** Fields that have a known badge color map. */
const BADGE_FIELD_COLORS: Record<string, Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'>> = {
  status: STATUS_COLORS,
  stage: STAGE_BADGE_COLORS,
  priority: PRIORITY_COLORS,
};

/** Human-readable labels for audit entity types. */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  plan_registry: 'plan',
  plan_review_round: 'review round',
  plan_request: 'request',
  plan_review_node: 'review note',
  plan_review_delegation: 'delegation',
};

/** Badge color for review sub-entity status values. */
const REVIEW_STATUS_COLORS: Record<string, 'green' | 'blue' | 'gray' | 'orange' | 'red'> = {
  open: 'blue',
  in_progress: 'orange',
  changes_requested: 'orange',
  approved: 'green',
  fulfilled: 'green',
  concluded: 'gray',
  cancelled: 'gray',
};

function formatActionText(event: AuditEventEntry): ReactNode {
  const { action, field, oldValue, newValue, entityType, entityLabel, commitSha } = event;
  const isSubEntity = entityType !== 'plan_registry';
  const entityPrefix = isSubEntity ? (ENTITY_TYPE_LABELS[entityType] ?? entityType.replace(/_/g, ' ')) : null;

  if (action === 'created' && entityType === 'git_commit' && commitSha) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-mono text-[10px] bg-neutral-100 dark:bg-neutral-800 rounded px-1 py-px">{commitSha.slice(0, 7)}</span>
        {entityLabel && <span className="truncate">{entityLabel}</span>}
      </span>
    );
  }

  // Sub-entity creation (e.g., "created review round", "created request")
  if (action === 'created' && isSubEntity) {
    return (
      <span className="inline-flex items-center gap-1">
        <span>created</span>
        <Badge color="blue" className="text-[9px] !py-0">{entityPrefix}</Badge>
        {entityLabel && <span className="text-neutral-400 truncate">{entityLabel}</span>}
      </span>
    );
  }

  // Resolve the best color map for this field — plan-level fields use BADGE_FIELD_COLORS,
  // sub-entity status fields (review round status, request status) use REVIEW_STATUS_COLORS.
  const colorMap = BADGE_FIELD_COLORS[field ?? '']
    ?? (field === 'status' && isSubEntity ? REVIEW_STATUS_COLORS : null);

  // Rich badge transition for known categorical fields
  if (field && oldValue && newValue && colorMap) {
    return (
      <span className="inline-flex items-center gap-1">
        {entityPrefix && <span className="text-neutral-400">{entityPrefix}</span>}
        <span className="text-neutral-400">{field}</span>
        <Badge color={colorMap[oldValue] ?? 'gray'} className="text-[9px] !py-0">{oldValue}</Badge>
        <Icon name="arrowRight" size={9} className="text-neutral-400 shrink-0" />
        <Badge color={colorMap[newValue] ?? 'gray'} className="text-[9px] !py-0">{newValue}</Badge>
      </span>
    );
  }

  // Badge for set-to-value on known fields
  if (field && !oldValue && newValue && colorMap) {
    return (
      <span className="inline-flex items-center gap-1">
        {entityPrefix && <span className="text-neutral-400">{entityPrefix}</span>}
        <span className="text-neutral-400">set {field}</span>
        <Icon name="arrowRight" size={9} className="text-neutral-400 shrink-0" />
        <Badge color={colorMap[newValue] ?? 'gray'} className="text-[9px] !py-0">{newValue}</Badge>
      </span>
    );
  }

  // Generic field change (plain text with arrow)
  if (field && oldValue && newValue) {
    return (
      <span className="inline-flex items-center gap-1">
        {entityPrefix && <span className="text-neutral-400">{entityPrefix}</span>}
        <span className="text-neutral-400">{field}:</span>
        <span className="line-through text-neutral-400">{oldValue}</span>
        <Icon name="arrowRight" size={9} className="text-neutral-400 shrink-0" />
        <span>{newValue}</span>
      </span>
    );
  }
  if (field && newValue) {
    return `${entityPrefix ? `${entityPrefix} ` : ''}set ${field} → ${newValue}`;
  }
  const label = entityLabel || entityType.replace(/_/g, ' ');
  return `${action} ${label}`;
}

function formatTimelineTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ══════════════════════════════════════════════════════════════════
// PlanUnifiedActivityView — contributors + audit timeline
// ══════════════════════════════════════════════════════════════════

export function PlanUnifiedActivityView({
  planId,
  participants,
  loadingParticipants,
  profileLabels,
}: {
  planId: string;
  participants: PlanParticipantsResponse | null;
  loadingParticipants: boolean;
  profileLabels: ReadonlyMap<string, string>;
}) {
  const [auditEvents, setAuditEvents] = useState<AuditEventEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);

  useEffect(() => {
    setLoadingAudit(true);
    pixsimClient
      .get<PlanEventsApiResponse>(`/dev/plans/registry/${encodeURIComponent(planId)}/events`, { params: { limit: 100 } })
      .then((res) => setAuditEvents(normalizePlanEvents(res)))
      .catch(() => setAuditEvents([]))
      .finally(() => setLoadingAudit(false));
  }, [planId]);

  const loading = loadingAudit || loadingParticipants;

  // Participant summary strip
  const dedupedParticipants = useMemo(() => {
    const all = participants?.participants ?? [];
    const seen = new Map<string, PlanParticipant>();
    for (const p of all) {
      const key = p.profileId || p.agentId || p.userId?.toString() || p.id;
      const existing = seen.get(key);
      if (!existing || p.touches > existing.touches) {
        seen.set(key, p);
      }
    }
    return [...seen.values()].sort((a, b) => b.touches - a.touches);
  }, [participants]);

  return (
    <div className="space-y-3">
      {/* Participant summary strip */}
      {dedupedParticipants.length > 0 && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
          <SectionHeader trailing={
            <span className="text-[10px] text-neutral-400">{dedupedParticipants.length} participant{dedupedParticipants.length !== 1 ? 's' : ''}</span>
          }>
            Contributors
          </SectionHeader>
          <div className="mt-2 flex flex-wrap gap-2">
            {dedupedParticipants.map((p) => {
              const label = formatActorLabel(
                { principalType: p.principalType, userId: p.userId, agentId: p.agentId, profileId: p.profileId },
                { profileLabels },
              );
              const iconName = p.principalType === 'agent' ? 'cpu' : p.principalType === 'service' ? 'zap' : 'user';
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-[11px]"
                  title={`${label} — ${p.role}, ${p.touches} touches, last seen ${formatDateTime(p.lastSeenAt)}`}
                >
                  <Icon name={iconName as never} size={11} className="text-neutral-400 shrink-0" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
                  <Badge color={p.role === 'reviewer' ? 'orange' : 'blue'} className="text-[9px] !py-0">{p.role}</Badge>
                  <span className="text-neutral-400 tabular-nums">{p.touches}x</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit timeline */}
      <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
        <SectionHeader trailing={
          <span className="text-[10px] text-neutral-400">
            {loading ? 'Loading...' : `${auditEvents.length} events`}
          </span>
        }>
          Timeline
        </SectionHeader>

        {!loading && auditEvents.length === 0 && (
          <div className="mt-2 text-[11px] text-neutral-400">No activity recorded for this plan.</div>
        )}

        {auditEvents.length > 0 && (
          <div className="mt-2 space-y-0.5 max-h-[500px] overflow-y-auto">
            {auditEvents.map((event, i) => {
              const prevDate = i > 0 ? formatTimelineDate(auditEvents[i - 1].timestamp) : null;
              const curDate = formatTimelineDate(event.timestamp);
              const showDate = curDate !== prevDate;

              return (
                <div key={event.id}>
                  {showDate && (
                    <div className="text-[9px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mt-2 mb-1 first:mt-0">
                      {curDate}
                    </div>
                  )}
                  <div className="flex items-start gap-2 py-0.5 text-[11px]">
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums shrink-0 w-[58px]">
                      {formatTimelineTime(event.timestamp)}
                    </span>
                    <Icon name={actorIcon(event.actor) as never} size={11} className="text-neutral-400 shrink-0 mt-0.5" />
                    <span className="font-medium text-neutral-600 dark:text-neutral-300 shrink-0">
                      {actorLabel(event.actor)}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400 min-w-0 flex-1 overflow-hidden">
                      {formatActionText(event)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
