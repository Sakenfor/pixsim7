import { AutomationExecution, AutomationStatus } from '../../types/automation';
import { Button, Panel, Badge } from '@pixsim7/ui';

interface ExecutionCardProps {
  execution: AutomationExecution;
  onViewDetails?: (execution: AutomationExecution) => void;
}

const statusColors: Record<AutomationStatus, 'blue' | 'green' | 'red' | 'gray' | 'purple'> = {
  [AutomationStatus.PENDING]: 'gray',
  [AutomationStatus.RUNNING]: 'blue',
  [AutomationStatus.COMPLETED]: 'green',
  [AutomationStatus.FAILED]: 'red',
  [AutomationStatus.CANCELLED]: 'gray',
};

const statusIcons: Record<AutomationStatus, string> = {
  [AutomationStatus.PENDING]: '⏳',
  [AutomationStatus.RUNNING]: '▶️',
  [AutomationStatus.COMPLETED]: '✅',
  [AutomationStatus.FAILED]: '❌',
  [AutomationStatus.CANCELLED]: '⏹️',
};

export function ExecutionCard({ execution, onViewDetails }: ExecutionCardProps) {
  const statusColor = statusColors[execution.status];
  const statusIcon = statusIcons[execution.status];

  const progress = execution.total_actions
    ? Math.round(((execution.current_action_index ?? 0) / execution.total_actions) * 100)
    : 0;

  const duration = execution.started_at && execution.completed_at
    ? Math.round((new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 1000)
    : execution.started_at
    ? Math.round((Date.now() - new Date(execution.started_at).getTime()) / 1000)
    : null;

  return (
    <Panel className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{statusIcon}</span>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Execution #{execution.id}
            </h3>
            <Badge color={statusColor}>{execution.status}</Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Preset ID: {execution.preset_id}
            {execution.account_id && ` • Account: #${execution.account_id}`}
            {execution.device_id && ` • Device: #${execution.device_id}`}
          </p>
        </div>
      </div>

      {/* Progress */}
      {execution.status === AutomationStatus.RUNNING && execution.total_actions && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {execution.current_action_index ?? 0} / {execution.total_actions} ({progress}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {execution.status === AutomationStatus.FAILED && execution.error_message && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          <span className="font-medium">Error:</span> {execution.error_message}
          {execution.error_action_index !== undefined && (
            <span className="ml-1">(at action {execution.error_action_index})</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Created:</span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {new Date(execution.created_at).toLocaleTimeString()}
          </span>
        </div>
        {duration !== null && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Duration:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {duration}s
            </span>
          </div>
        )}
        {execution.retry_count > 0 && (
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Retries:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {execution.retry_count} / {execution.max_retries}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {onViewDetails && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onViewDetails(execution)}
            className="w-full"
          >
            View Details
          </Button>
        </div>
      )}
    </Panel>
  );
}
