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
  Dropdown,
  DropdownItem,
  EmptyState,
  FilterPillGroup,
  type FilterPillOption,
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

// =============================================================================
// Types
// =============================================================================

interface CheckpointStep {
  id: string;
  label: string;
  done: boolean;
  tests?: string[];
}

interface CheckpointEvidence {
  kind: string;
  ref: string;
}

interface Checkpoint {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'blocked';
  criteria: string;
  progress?: number;
  steps?: CheckpointStep[];
  evidence?: CheckpointEvidence[];
}

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
  commitSha: string | null;
  newScope: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_ORDER = ['active', 'done', 'parked'] as const;

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

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// =============================================================================
// Clickable Badge with Dropdown
// =============================================================================

function ClickableBadge({
  value,
  color,
  options,
  onSelect,
  disabled,
}: {
  value: string;
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
          {value}
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

// =============================================================================
// Expandable Checkpoints
// =============================================================================

function CheckpointList({
  checkpoints,
  forgeUrlTemplate,
}: {
  checkpoints: Checkpoint[];
  forgeUrlTemplate?: string | null;
}) {
  // Active checkpoints start expanded, others collapsed
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(checkpoints.filter((cp) => cp.status === 'active').map((cp) => cp.id)),
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div>
      <SectionHeader>Checkpoints</SectionHeader>
      <div className="mt-2 space-y-1">
        {checkpoints.map((cp) => {
          const cpSteps = cp.steps ?? [];
          const cpDone = cpSteps.filter((s) => s.done).length;
          const cpTotal = cpSteps.length;
          const cpPct = cpTotal > 0 ? Math.round((cpDone / cpTotal) * 100) : (cp.status === 'done' ? 100 : 0);
          const isOpen = expanded.has(cp.id);
          const cpEvidence = cp.evidence ?? [];
          const hasContent = !!cp.criteria || cpSteps.length > 0 || cpEvidence.length > 0;

          return (
            <div
              key={cp.id}
              className={`rounded-md border overflow-hidden ${
                cp.status === 'active'
                  ? 'border-green-300 dark:border-green-700'
                  : cp.status === 'done'
                    ? 'border-neutral-200 dark:border-neutral-700 opacity-75'
                    : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <button
                onClick={() => hasContent && toggle(cp.id)}
                className={`w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-2 text-left ${hasContent ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {hasContent && (
                  <Icon
                    name="chevronRight"
                    size={10}
                    className={`text-neutral-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  />
                )}
                <Badge
                  color={cp.status === 'done' ? 'green' : cp.status === 'active' ? 'blue' : cp.status === 'blocked' ? 'red' : 'gray'}
                  className="text-[10px]"
                >
                  {cp.status}
                </Badge>
                <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 flex-1 truncate">{cp.label}</span>
                {cpTotal > 0 && (
                  <span className="text-[10px] text-neutral-400 flex-shrink-0">{cpDone}/{cpTotal} ({cpPct}%)</span>
                )}
              </button>

              {/* Progress bar — always visible */}
              {cpTotal > 0 && (
                <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className={`h-full transition-all ${cp.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${cpPct}%` }}
                  />
                </div>
              )}

              {isOpen && (
                <>
                  {cp.criteria && (
                    <div className="px-3 py-1 text-[11px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
                      {cp.criteria}
                    </div>
                  )}

                  {cpSteps.length > 0 && (
                    <div className="px-3 py-2 space-y-1">
                      {cpSteps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 ${step.done ? 'text-green-500' : 'text-neutral-400'}`}>
                            {step.done ? '\u2713' : '\u25CB'}
                          </span>
                          <span className={step.done ? 'text-neutral-500 line-through' : 'text-neutral-700 dark:text-neutral-300'}>
                            {step.label}
                          </span>
                          {step.tests && step.tests.length > 0 && (
                            <span className="ml-auto flex gap-1">
                              {step.tests.map((t) => (
                                <Badge key={t} color="purple" className="text-[9px]">{t}</Badge>
                              ))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {cpEvidence.length > 0 && (
                    <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 space-y-0.5">
                      <div className="text-[10px] text-neutral-500 font-medium mb-1">Evidence</div>
                      {cpEvidence.map((ev) => {
                        const commitUrl =
                          ev.kind === 'git_commit' && forgeUrlTemplate
                            ? forgeUrlTemplate.replace('{sha}', ev.ref)
                            : null;
                        return (
                          <div key={`${ev.kind}:${ev.ref}`} className="flex items-center gap-1.5 text-[11px]">
                            <Badge
                              color={ev.kind === 'git_commit' ? 'blue' : ev.kind === 'test_suite' ? 'green' : 'gray'}
                              className="text-[9px] !px-1"
                            >
                              {ev.kind === 'git_commit' ? 'commit' : ev.kind}
                            </Badge>
                            {commitUrl ? (
                              <a
                                href={commitUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-[10px]"
                                title={ev.ref}
                              >
                                {ev.ref.slice(0, 7)}
                              </a>
                            ) : (
                              <code
                                className="text-neutral-600 dark:text-neutral-400 font-mono text-[10px]"
                                title={ev.kind === 'git_commit' ? ev.ref : undefined}
                              >
                                {ev.kind === 'git_commit' ? ev.ref.slice(0, 7) : ev.ref}
                              </code>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Plan Detail View
// =============================================================================

function PlanDetailView({
  planId,
  onPlanChanged,
  forgeUrlTemplate,
}: {
  planId: string;
  onPlanChanged: () => void;
  forgeUrlTemplate?: string | null;
}) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);

  const loadDetail = useCallback(() => {
    setLoading(true);
    setError('');
    pixsimClient
      .get<PlanDetail>(`/dev/plans/${planId}?refresh=true`)
      .then((res) => setDetail(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plan'))
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleUpdate = useCallback(() => {
    loadDetail();
    onPlanChanged();
  }, [loadDetail, onPlanChanged]);

  const applyUpdate = useCallback(
    async (updates: Record<string, string>) => {
      setUpdating(true);
      setLastResult(null);
      try {
        const res = await pixsimClient.patch<PlanUpdateResponse>(
          `/dev/plans/${planId}`,
          updates,
        );
        const changed = res.changes.map((c) => `${c.field}: ${c.old}\u2192${c.new}`).join(', ');
        setLastResult(
          res.commitSha
            ? `Updated (${changed}) \u2014 committed ${res.commitSha.slice(0, 7)}`
            : `Updated (${changed})`,
        );
        handleUpdate();
      } catch (err) {
        setLastResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setUpdating(false);
      }
    },
    [planId, handleUpdate],
  );

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

  const totalSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.length ?? 0), 0) ?? 0;
  const doneSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.filter((s) => s.done).length ?? 0), 0) ?? 0;
  const overallProgress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : null;

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

  return (
    <div className="p-4 space-y-4">
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
        <span><span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.owner}</span></span>
        <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
        <span>Stage: <span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.stage}</span></span>
        {overallProgress !== null ? (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
            <span>{overallProgress}% <span className="text-neutral-400">({doneSteps}/{totalSteps} steps)</span></span>
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

      {/* Sub-plans */}
      {detail.children.length > 0 && (
        <div>
          <SectionHeader>Sub-plans ({detail.children.length})</SectionHeader>
          <div className="mt-2 space-y-1">
            {detail.children.map((child) => (
              <div
                key={child.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
              >
                <Badge color={STATUS_COLORS[child.status] ?? 'gray'} className="text-[10px]">{child.status}</Badge>
                <span className="font-medium text-neutral-800 dark:text-neutral-200 flex-1 truncate">{child.title}</span>
                <span className="text-neutral-400">{child.stage}</span>
                <Badge color={PRIORITY_COLORS[child.priority] ?? 'gray'} className="text-[10px]">{child.priority}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parent reference */}
      {detail.parentId && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Parent: <span className="font-mono">{detail.parentId}</span>
        </div>
      )}

      {/* Plan markdown — collapsed by default */}
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

export function PlansPanel() {
  const { theme: variant } = useTheme();

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [forgeUrlTemplate, setForgeUrlTemplate] = useState<string | null>(null);

  // Fetch forge commit URL template once
  useEffect(() => {
    pixsimClient
      .get<{ forgeCommitUrlTemplate?: string | null }>('/dev/plans/settings')
      .then((res) => {
        if (res.forgeCommitUrlTemplate) setForgeUrlTemplate(res.forgeCommitUrlTemplate);
      })
      .catch(() => {/* non-critical */});
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await pixsimClient.get<PlansIndexResponse>('/dev/plans?refresh=true');
      setPlans(res.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, refreshKey]);

  const handlePlanChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Filter plans
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
    return result;
  }, [plans, statusFilter, searchQuery]);

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

  // Group filtered plans by status for sidebar sections
  const grouped = useMemo(() => {
    const map = new Map<string, PlanSummary[]>();
    for (const p of filteredPlans) {
      if (!map.has(p.status)) map.set(p.status, []);
      map.get(p.status)!.push(p);
    }
    return map;
  }, [filteredPlans]);

  // Build sidebar sections
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const result: SidebarContentLayoutSection[] = [];

    for (const status of STATUS_ORDER) {
      const statusPlans = grouped.get(status);
      if (!statusPlans || statusPlans.length === 0) continue;

      result.push({
        id: `status:${status}`,
        label: `${status} (${statusPlans.length})`,
        icon: <Icon name={(STATUS_ICONS[status] ?? 'circle') as any} size={12} />,
        children: statusPlans.map((p) => ({
          id: `plan:${p.id}`,
          label: p.title,
          icon: (
            <span className="relative flex items-center justify-center">
              <Icon name={(PLAN_TYPE_ICONS[p.planType] ?? 'fileText') as any} size={11} />
              <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASSES[p.status] ?? 'bg-neutral-400'}`} />
            </span>
          ),
        })),
      });
    }

    return result;
  }, [grouped]);

  const nav = useSidebarNav({
    sections,
    storageKey: 'plans-panel:nav',
  });

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
    content = <PlanDetailView key={`${planId}-${refreshKey}`} planId={planId} onPlanChanged={handlePlanChanged} forgeUrlTemplate={forgeUrlTemplate} />;
  } else if (activeId.startsWith('status:')) {
    const status = activeId.slice(7);
    const count = grouped.get(status)?.length ?? 0;
    content = (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          message={`${count} ${status} plan${count !== 1 ? 's' : ''}`}
          description="Select a plan from the sidebar"
          icon={<Icon name={(STATUS_ICONS[status] ?? 'fileText') as any} size={20} />}
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
        </div>
      }
      sidebarWidth="w-52"
      variant={variant}
      collapsible
      expandedWidth={208}
      persistKey="plans-panel-sidebar"
      contentClassName="overflow-y-auto"
    >
      {content}
    </SidebarContentLayout>
  );
}
