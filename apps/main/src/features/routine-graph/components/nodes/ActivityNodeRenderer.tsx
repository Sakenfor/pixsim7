/**
 * Activity Node Renderer
 *
 * Renders a direct activity node that represents activities
 * available regardless of time/conditions.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import { Icon } from '@lib/icons';

import type { RoutineNode } from '../../types';
import { getNodeTypeColor } from '../../types';

export interface ActivityNodeData {
  routineNode: RoutineNode;
  isSelected: boolean;
}

function ActivityNodeRenderer({ data, selected }: NodeProps<ActivityNodeData>) {
  const { routineNode } = data;
  const color = getNodeTypeColor('activity');
  const activities = routineNode.preferredActivities ?? [];

  return (
    <div
      className={`
        min-w-[160px] rounded-lg border-2 bg-white dark:bg-neutral-800
        shadow-md transition-shadow
        ${selected ? 'shadow-lg ring-2 ring-emerald-400' : ''}
      `}
      style={{ borderColor: color }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon name="activity" size={14} style={{ color }} />
        <span className="text-xs font-semibold" style={{ color }}>
          Activity
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Label */}
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {routineNode.label || 'Unnamed Activity'}
        </div>

        {/* Activities List */}
        {activities.length > 0 ? (
          <div className="space-y-1">
            {activities.map((a) => (
              <div
                key={a.activityId}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-neutral-700 dark:text-neutral-300 truncate">
                  {a.activityId}
                </span>
                <span
                  className={`
                    px-1 py-0.5 rounded text-[10px] font-medium
                    ${a.weight > 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : ''}
                    ${a.weight < 1 ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400' : ''}
                    ${a.weight === 1 ? 'text-neutral-400' : ''}
                  `}
                >
                  {a.weight.toFixed(1)}x
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-neutral-400 italic">
            No activities assigned
          </div>
        )}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ActivityNodeRenderer);
