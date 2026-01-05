import { type ExecutionLoop, type LoopStatus } from '../types';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';

interface LoopCardProps {
  loop: ExecutionLoop;
  onEdit?: (loop: ExecutionLoop) => void;
  onDelete?: (loop: ExecutionLoop) => void;
  onStart?: (loop: ExecutionLoop) => void;
  onPause?: (loop: ExecutionLoop) => void;
  onRunNow?: (loop: ExecutionLoop) => void;
}

const statusColors: Record<LoopStatus, 'blue' | 'green' | 'red' | 'gray' | 'purple'> = {
  active: 'green',
  paused: 'gray',
  stopped: 'blue',
  error: 'red',
};

export function LoopCard({ loop, onEdit, onDelete, onStart, onPause, onRunNow }: LoopCardProps) {
  const statusColor = statusColors[loop.status];
  const isActive = loop.status === 'active' && loop.is_enabled;
  const successRate = loop.total_executions > 0
    ? Math.round((loop.successful_executions / loop.total_executions) * 100)
    : 0;

  return (
    <Panel className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {loop.name}
            </h3>
            <Badge color={statusColor}>{loop.status}</Badge>
            {!loop.is_enabled && <Badge color="red">Disabled</Badge>}
          </div>
          {loop.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {loop.description}
            </p>
          )}
        </div>

        {/* Active indicator */}
        {isActive && (
          <div className="flex-shrink-0">
            <div className="w-3 h-3 bg-green-500 rounded-full shadow-lg shadow-green-500/50" />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Total:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {loop.total_executions}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Today:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {loop.executions_today}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Success:</span>
            <span className="font-medium text-green-600">
              {loop.successful_executions}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Failed:</span>
            <span className="font-medium text-red-600">
              {loop.failed_executions}
            </span>
          </div>
        </div>
      </div>

      {/* Success Rate */}
      {loop.total_executions > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {successRate}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                successRate >= 80 ? 'bg-green-600' :
                successRate >= 50 ? 'bg-yellow-600' :
                'bg-red-600'
              }`}
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Warnings */}
      {loop.consecutive_failures > 0 && (
        <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
          ⚠️ {loop.consecutive_failures} consecutive failures
          {loop.consecutive_failures >= loop.max_consecutive_failures && ' (paused)'}
        </div>
      )}

      {/* Config Summary */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div>Mode: {loop.preset_execution_mode} • Selection: {loop.selection_mode}</div>
        <div>Delay: {loop.delay_between_executions}s
          {loop.max_executions_per_day && ` • Daily limit: ${loop.max_executions_per_day}`}
        </div>
      </div>

      {loop.last_execution_at && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last run: {new Date(loop.last_execution_at).toLocaleString()}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        {loop.status === 'paused' && onStart && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onStart(loop)}
            className="flex-1"
          >
            ▶️ Start
          </Button>
        )}
        {loop.status === 'active' && onPause && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPause(loop)}
            className="flex-1"
          >
            ⏸️ Pause
          </Button>
        )}
        {onRunNow && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onRunNow(loop)}
            title="Run immediately (bypass delays)"
          >
            ▶️ Run Now
          </Button>
        )}
        {onEdit && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(loop)}
          >
            ✏️
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(loop)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            🗑️
          </Button>
        )}
      </div>
    </Panel>
  );
}
