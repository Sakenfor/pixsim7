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
  EmptyState,
  FilterPillGroup,
  type FilterPillOption,
  SearchInput,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  StatCard,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

interface Checkpoint {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'blocked';
  criteria: string;
  progress?: number;
  steps?: CheckpointStep[];
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
// Plan Actions Bar
// =============================================================================

function PlanActions({
  plan,
  onUpdate,
}: {
  plan: PlanDetail;
  onUpdate: () => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const applyUpdate = useCallback(
    async (updates: Record<string, string>) => {
      setUpdating(true);
      setLastResult(null);
      try {
        const res = await pixsimClient.patch<PlanUpdateResponse>(
          `/dev/plans/update/${plan.id}`,
          updates,
        );
        const changed = res.changes.map((c) => `${c.field}: ${c.old}→${c.new}`).join(', ');
        setLastResult(
          res.commitSha
            ? `Updated (${changed}) — committed ${res.commitSha.slice(0, 7)}`
            : `Updated (${changed})`,
        );
        onUpdate();
      } catch (err) {
        setLastResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setUpdating(false);
      }
    },
    [plan.id, onUpdate],
  );

  // Build available status transitions
  const statusActions: { label: string; status: string; color: 'green' | 'blue' | 'gray' | 'orange' | 'red' }[] = [];
  if (plan.status !== 'active') statusActions.push({ label: 'Activate', status: 'active', color: 'green' });
  if (plan.status !== 'parked') statusActions.push({ label: 'Park', status: 'parked', color: 'gray' });
  if (plan.status !== 'done') statusActions.push({ label: 'Mark Done', status: 'done', color: 'blue' });
  if (plan.status !== 'blocked') statusActions.push({ label: 'Block', status: 'blocked', color: 'red' });

  const priorityActions: { label: string; priority: string }[] = [];
  if (plan.priority !== 'high') priorityActions.push({ label: 'High', priority: 'high' });
  if (plan.priority !== 'normal') priorityActions.push({ label: 'Normal', priority: 'normal' });
  if (plan.priority !== 'low') priorityActions.push({ label: 'Low', priority: 'low' });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader className="mr-2">Status</SectionHeader>
        {statusActions.map((a) => (
          <Button
            key={a.status}
            size="sm"
            variant="outline"
            onClick={() => void applyUpdate({ status: a.status })}
            disabled={updating}
          >
            {a.label}
          </Button>
        ))}

        <span className="mx-1 text-neutral-300 dark:text-neutral-600">|</span>

        <SectionHeader className="mr-2">Priority</SectionHeader>
        {priorityActions.map((a) => (
          <Button
            key={a.priority}
            size="sm"
            variant="ghost"
            onClick={() => void applyUpdate({ priority: a.priority })}
            disabled={updating}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {lastResult && (
        <div className={`text-xs ${lastResult.startsWith('Failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {lastResult}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Plan Detail View
// =============================================================================

function PlanDetailView({
  planId,
  onPlanChanged,
}: {
  planId: string;
  onPlanChanged: () => void;
}) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {detail.title}
          </h2>
          <Badge color={STATUS_COLORS[detail.status] ?? 'gray'}>{detail.status}</Badge>
          <Badge color={PRIORITY_COLORS[detail.priority] ?? 'gray'}>{detail.priority}</Badge>
          <Badge color="gray" className="text-[10px]">{detail.planType}</Badge>
          {detail.visibility !== 'public' && (
            <Badge color={detail.visibility === 'private' ? 'orange' : 'blue'} className="text-[10px]">
              {detail.visibility}
            </Badge>
          )}
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">{detail.summary}</div>
      </div>

      {/* Actions */}
      <PlanActions plan={detail} onUpdate={handleUpdate} />

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Owner" value={detail.owner} />
        <StatCard label="Stage" value={detail.stage} />
        <StatCard
          label="Progress"
          value={overallProgress !== null ? `${overallProgress}%` : detail.scope}
          sublabel={totalSteps > 0 ? `${doneSteps}/${totalSteps} steps` : undefined}
        />
        <StatCard label="Updated" value={formatDate(detail.lastUpdated)} />
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
        <div>
          <SectionHeader>Checkpoints</SectionHeader>
          <div className="mt-2 space-y-2">
            {detail.checkpoints.map((cp) => {
              const cpSteps = cp.steps ?? [];
              const cpDone = cpSteps.filter((s) => s.done).length;
              const cpTotal = cpSteps.length;
              const cpPct = cpTotal > 0 ? Math.round((cpDone / cpTotal) * 100) : (cp.status === 'done' ? 100 : 0);

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
                  <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-2">
                    <Badge
                      color={cp.status === 'done' ? 'green' : cp.status === 'active' ? 'blue' : cp.status === 'blocked' ? 'red' : 'gray'}
                      className="text-[10px]"
                    >
                      {cp.status}
                    </Badge>
                    <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 flex-1">{cp.label}</span>
                    {cpTotal > 0 && (
                      <span className="text-[10px] text-neutral-400">{cpDone}/{cpTotal} ({cpPct}%)</span>
                    )}
                  </div>

                  {cp.criteria && (
                    <div className="px-3 py-1 text-[11px] text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                      {cp.criteria}
                    </div>
                  )}

                  {cpSteps.length > 0 && (
                    <div className="px-3 py-2 space-y-1">
                      {cpSteps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 ${step.done ? 'text-green-500' : 'text-neutral-400'}`}>
                            {step.done ? '✓' : '○'}
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

                  {/* Progress bar */}
                  {cpTotal > 0 && (
                    <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className={`h-full transition-all ${cp.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${cpPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

      {/* Plan markdown (collapsed by default when checkpoints exist) */}
      {detail.markdown && (
        <div>
          <SectionHeader
            trailing={
              <code className="text-[10px] text-neutral-400">{detail.planPath}</code>
            }
          >
            Full Plan
          </SectionHeader>
          <pre className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs whitespace-pre-wrap overflow-auto max-h-[32rem] leading-relaxed">
            {detail.markdown}
          </pre>
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
          icon: <Icon name="fileText" size={11} />,
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
    content = <PlanDetailView key={`${planId}-${refreshKey}`} planId={planId} onPlanChanged={handlePlanChanged} />;
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
