import { type AppActionPreset } from '@/types/automation';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';

interface PresetCardProps {
  preset: AppActionPreset;
  onEdit?: (preset: AppActionPreset) => void;
  onDelete?: (preset: AppActionPreset) => void;
  onRun?: (preset: AppActionPreset) => void;
  onCopy?: (preset: AppActionPreset) => void;
}

export function PresetCard({ preset, onEdit, onDelete, onRun, onCopy }: PresetCardProps) {
  const isSnippet = preset.category?.toLowerCase() === 'snippet';
  const categoryColor = preset.is_system
    ? 'purple'
    : preset.is_shared
    ? 'blue'
    : isSnippet
    ? 'green'
    : 'gray';

  return (
    <Panel className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {preset.name}
          </h3>
          {preset.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {preset.description}
            </p>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-col gap-1 items-end">
          {preset.is_system && <Badge color="purple">System</Badge>}
          {preset.is_shared && !preset.is_system && <Badge color="blue">Shared</Badge>}
          {preset.category && (
            <Badge color={categoryColor}>{preset.category}</Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Actions:</span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {preset.actions.length}
          </span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Used:</span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {preset.usage_count}x
          </span>
        </div>
      </div>

      {preset.last_used && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last used: {new Date(preset.last_used).toLocaleString()}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        {onRun && !isSnippet && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onRun(preset)}
            className="flex-1"
          >
            ▶️ Run
          </Button>
        )}
        {isSnippet && (
          <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
            📦 Snippet - use via Call Preset
          </span>
        )}
        {onCopy && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCopy(preset)}
            title="Copy this preset to create an editable version"
          >
            📋 Copy
          </Button>
        )}
        {onEdit && !preset.is_system && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onEdit(preset)}
          >
            ✏️ Edit
          </Button>
        )}
        {onDelete && !preset.is_system && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(preset)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            🗑️
          </Button>
        )}
      </div>
    </Panel>
  );
}
