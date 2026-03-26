/**
 * PlanDetailHeader — plan lineage breadcrumb, title/badges row, metadata row,
 * progress computation, and lastResult feedback notice.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import { Badge } from '@pixsim7/shared.ui';

import { Icon } from '@lib/icons';

import { getCheckpointPointProgress } from '../PlanCheckpointList';
import { ClickableBadge } from './shared';
import type { PlanDetail, PlanStageOptionEntry } from './types';
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
}

export function PlanDetailHeader({
  detail,
  stageOptions,
  stageOptionsByValue,
  updating,
  lastResult,
  onApplyUpdate,
  onNavigatePlan,
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

  return (
    <>
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
