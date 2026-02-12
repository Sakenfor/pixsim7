/**
 * Time Slot Node Renderer
 *
 * Renders a time-based routine node showing the time window
 * and available activities during that period.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import { Icon } from '@lib/icons';

import type { RoutineNode } from '../../types';
import { formatTimeRange, getNodeTypeColor } from '../../types';

export interface TimeSlotNodeData {
  routineNode: RoutineNode;
  isSelected: boolean;
}

function TimeSlotNodeRenderer({ data, selected }: NodeProps<TimeSlotNodeData>) {
  const { routineNode } = data;
  const color = getNodeTypeColor('time_slot');
  const timeRange = routineNode.timeRangeSeconds;
  const activities = routineNode.preferredActivities ?? [];

  return (
    <div
      className={`
        min-w-[180px] rounded-lg border-2 bg-white dark:bg-neutral-800
        shadow-md transition-shadow
        ${selected ? 'shadow-lg ring-2 ring-blue-400' : ''}
      `}
      style={{ borderColor: color }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon name="clock" size={14} style={{ color }} />
        <span className="text-xs font-semibold" style={{ color }}>
          Time Slot
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Label */}
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {routineNode.label || 'Unnamed Slot'}
        </div>

        {/* Time Range */}
        {timeRange && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            <Icon name="clock" size={12} />
            <span>{formatTimeRange(timeRange)}</span>
          </div>
        )}

        {/* Activities Preview */}
        {activities.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Activities ({activities.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {activities.slice(0, 3).map((a) => (
                <span
                  key={a.activityId}
                  className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                >
                  {a.activityId}
                </span>
              ))}
              {activities.length > 3 && (
                <span className="px-1.5 py-0.5 text-[10px] text-neutral-500">
                  +{activities.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(TimeSlotNodeRenderer);
