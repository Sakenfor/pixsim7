/**
 * PlanDetailHeader — plan lineage breadcrumb, title/badges row, metadata row,
 * progress computation, and lastResult feedback notice.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import {
  Badge,
  Popover,
} from '@pixsim7/shared.ui';
import { useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { getCheckpointPointProgress } from '../PlanCheckpointList';

import { ClickableBadge } from './shared';
import type { PlanChildSummary, PlanDetail, PlanStageOptionEntry } from './types';
import {
  formatDate,
  PRIORITY_COLORS,
  STAGE_BADGE_COLORS,
  stageLabelFromValue,
  STATUS_COLORS,
} from './types';

export interface PlanDetailHeaderProps {
  detail: PlanDetail;
  stageOptions: PlanStageOptionEntry[];
  stageOptionsByValue: Map<string, PlanStageOptionEntry>;
  updating: boolean;
  lastResult: string | null;
  onApplyUpdate: (updates: Record<string, string>) => void;
  onNavigatePlan?: (planId: string) => void;
  /** Ordered sibling phases when viewing a child plan (resolved from parent). */
  siblingPhases?: PlanChildSummary[];
}

export function PlanDetailHeader({
  detail,
  stageOptions,
  stageOptionsByValue,
  updating,
  lastResult,
  onApplyUpdate,
  onNavigatePlan,
  siblingPhases = [],
}: PlanDetailHeaderProps) {
  // Progress computation
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

  // Option arrays
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

  // Build ordered phases list: use `phases` ordering when available, fall back to children order
  const orderedPhases = useMemo<PlanChildSummary[]>(() => {
    if (detail.children.length === 0) return [];
    const childMap = new Map(detail.children.map((c) => [c.id, c]));
    if (detail.phases.length > 0) {
      const ordered: PlanChildSummary[] = [];
      for (const id of detail.phases) {
        const child = childMap.get(id);
        if (child) { ordered.push(child); childMap.delete(id); }
      }
      // Append any children not listed in phases
      for (const child of childMap.values()) ordered.push(child);
      return ordered;
    }
    return detail.children;
  }, [detail.children, detail.phases]);

  return (
    <>
      {/* Plan lineage bar */}
      {(detail.parentId || orderedPhases.length > 0 || siblingPhases.length > 0) && (
        <div className="flex items-center gap-2 text-[10px]">
          {/* Parent link */}
          {detail.parentId && (
            <button
              type="button"
              onClick={() => onNavigatePlan?.(detail.parentId!)}
              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              title={`Go to parent: ${detail.parentId}`}
            >
              <Icon name="chevronLeft" size={10} />
              <span className="truncate max-w-[160px]">{detail.parentId}</span>
            </button>
          )}
          {/* Phase dropdown: own children (parent view) or siblings (child view) */}
          {orderedPhases.length > 0 && (
            <PhaseNavigator
              phases={orderedPhases}
              currentId={detail.id}
              onNavigate={(id) => onNavigatePlan?.(id)}
            />
          )}
          {siblingPhases.length > 0 && orderedPhases.length === 0 && (
            <PhaseNavigator
              phases={siblingPhases}
              currentId={detail.id}
              onNavigate={(id) => onNavigatePlan?.(id)}
            />
          )}
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
            onSelect={(v) => onApplyUpdate({ status: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.priority}
            color={PRIORITY_COLORS[detail.priority] ?? 'gray'}
            options={priorityOptions}
            onSelect={(v) => onApplyUpdate({ priority: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.stage}
            displayValue={stageLabel}
            color={STAGE_BADGE_COLORS[detail.stage] ?? 'gray'}
            options={stageBadgeOptions}
            onSelect={(v) => onApplyUpdate({ stage: v })}
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
    </>
  );
}

// ── Phase navigator (dropdown + prev/next) ──────────────────────

function PhaseNavigator({
  phases,
  currentId,
  onNavigate,
}: {
  phases: PlanChildSummary[];
  /** ID of the currently viewed plan (used to highlight current phase and enable prev/next). */
  currentId?: string;
  onNavigate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentIndex = currentId ? phases.findIndex((p) => p.id === currentId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < phases.length - 1;

  const label = currentIndex >= 0
    ? phases[currentIndex].title
    : `${phases.length} phase${phases.length !== 1 ? 's' : ''}`;

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={!hasPrev}
        onClick={() => hasPrev && onNavigate(phases[currentIndex - 1].id)}
        className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none"
        title={hasPrev ? `Previous: ${phases[currentIndex - 1].title}` : 'No previous phase'}
      >
        <Icon name="chevronLeft" size={12} className="text-neutral-500" />
      </button>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[10px] text-neutral-700 dark:text-neutral-300 max-w-[260px] truncate"
      >
        <span className="truncate">{label}</span>
        <Icon name="chevronDown" size={8} className="shrink-0 opacity-50" />
      </button>
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        className="min-w-[180px]"
      >
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg py-1 text-xs">
          {phases.map((phase, i) => (
            <button
              key={phase.id}
              type="button"
              onClick={() => { onNavigate(phase.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${phase.id === currentId ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}
            >
              <Badge
                color={STATUS_COLORS[phase.status] ?? 'gray'}
                className="text-[9px] !px-1 shrink-0"
              >
                {phase.id === currentId ? '\u2713' : `${i + 1}`}
              </Badge>
              <span className="truncate text-neutral-700 dark:text-neutral-300">{phase.title}</span>
            </button>
          ))}
        </div>
      </Popover>
      <button
        type="button"
        disabled={!hasNext}
        onClick={() => hasNext && onNavigate(phases[currentIndex + 1].id)}
        className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none"
        title={hasNext ? `Next: ${phases[currentIndex + 1].title}` : 'No next phase'}
      >
        <Icon name="chevronRight" size={12} className="text-neutral-500" />
      </button>
    </div>
  );
}
