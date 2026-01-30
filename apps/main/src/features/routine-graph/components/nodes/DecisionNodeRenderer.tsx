/**
 * Decision Node Renderer
 *
 * Renders a conditional decision node that branches based on
 * NPC state (energy, mood, relationships, etc.).
 */

import { GitBranch, Zap } from 'lucide-react';
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import type { RoutineNode } from '../../types';
import { getNodeTypeColor } from '../../types';

export interface DecisionNodeData {
  routineNode: RoutineNode;
  isSelected: boolean;
}

function DecisionNodeRenderer({ data, selected }: NodeProps<DecisionNodeData>) {
  const { routineNode } = data;
  const color = getNodeTypeColor('decision');
  const conditions = routineNode.decisionConditions ?? [];
  const activities = routineNode.preferredActivities ?? [];

  // Format condition for display
  const formatCondition = (cond: { type: string; min?: number; max?: number; metric?: string }) => {
    if (cond.type === 'energy' || cond.type === 'energy_between') {
      if (cond.min !== undefined && cond.max !== undefined) {
        return `Energy ${cond.min}-${cond.max}%`;
      }
      if (cond.min !== undefined) return `Energy >= ${cond.min}%`;
      if (cond.max !== undefined) return `Energy <= ${cond.max}%`;
    }
    if (cond.type === 'mood_in') return 'Mood check';
    if (cond.type === 'relationship_gt') return `Relationship > ${cond.min ?? '?'}`;
    if (cond.type === 'random_chance') return `${((cond.min ?? 0) * 100).toFixed(0)}% chance`;
    return cond.type;
  };

  return (
    <div
      className={`
        min-w-[180px] rounded-lg border-2 bg-white dark:bg-neutral-800
        shadow-md transition-shadow
        ${selected ? 'shadow-lg ring-2 ring-amber-400' : ''}
      `}
      style={{ borderColor: color }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}20` }}
      >
        <GitBranch size={14} style={{ color }} />
        <span className="text-xs font-semibold" style={{ color }}>
          Decision
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Label */}
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {routineNode.label || 'Unnamed Decision'}
        </div>

        {/* Conditions */}
        {conditions.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Conditions
            </div>
            <div className="space-y-0.5">
              {conditions.slice(0, 2).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
                >
                  <Zap size={10} />
                  <span>{formatCondition(c)}</span>
                </div>
              ))}
              {conditions.length > 2 && (
                <div className="text-[10px] text-neutral-500">
                  +{conditions.length - 2} more conditions
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-neutral-400 italic">
            No conditions (always active)
          </div>
        )}

        {/* Activities Preview */}
        {activities.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Activities ({activities.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {activities.slice(0, 2).map((a) => (
                <span
                  key={a.activityId}
                  className="px-1.5 py-0.5 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded"
                >
                  {a.activityId}
                </span>
              ))}
              {activities.length > 2 && (
                <span className="text-[10px] text-neutral-500">+{activities.length - 2}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(DecisionNodeRenderer);
