/**
 * PlansPanel - Plan registry browser for dev tools
 *
 * Sidebar: plans grouped by status (active/done/parked), filterable.
 * Content: plan detail with metadata, markdown, and action buttons.
 * Uses GET /dev/plans, GET /dev/plans/{id}, PATCH /dev/plans/update/{id}.
 */

import {
  Button,
  EmptyState,
  FilterPillGroup,
  type FilterPillOption,
  SearchInput,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { PlanDetailView } from './plans/detail';
import type {
  PlanStageOptionEntry,
  PlanStagesResponse,
  PlanSummary,
  PlansIndexResponse,
} from './plans/detail/types';
import {
  FALLBACK_PLAN_STAGE_OPTIONS,
  isCanonicalPlanId,
  PLAN_TYPE_ICONS,
  STAGE_ICONS,
  stageLabelFromValue,
  STATUS_DOT_CLASSES,
  STATUS_ICONS,
  STATUS_ORDER,
} from './plans/detail/types';

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
                title={`${reviewCount} review round${reviewCount !== 1 ? 's' : ''}${activeReviews > 0 ? ` (${activeReviews} active)` : ' (all concluded)'}`}
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
