import { type AppActionPreset } from '@/types/automation';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';

interface PresetCardProps {
  preset: AppActionPreset;
  onEdit?: (preset: AppActionPreset) => void;
  onDelete?: (preset: AppActionPreset) => void;
  onRun?: (preset: AppActionPreset) => void;
  onCopy?: (preset: AppActionPreset) => void;
}

// Get preset type info (icon, label, colors)
function getPresetTypeInfo(preset: AppActionPreset) {
  const isSnippet = preset.category?.toLowerCase() === 'snippet';

  if (isSnippet) {
    return {
      icon: '📦',
      label: 'Snippet',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
      borderColor: 'border-green-200 dark:border-green-800',
    };
  }
  if (preset.is_system) {
    return {
      icon: '⚙️',
      label: 'System',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-700 dark:text-purple-300',
      borderColor: 'border-purple-200 dark:border-purple-800',
    };
  }
  if (preset.is_shared) {
    return {
      icon: '👥',
      label: 'Shared',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-700 dark:text-blue-300',
      borderColor: 'border-blue-200 dark:border-blue-800',
    };
  }
  return {
    icon: '👤',
    label: 'My Preset',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-700 dark:text-gray-300',
    borderColor: 'border-gray-200 dark:border-gray-700',
  };
}

export function PresetCard({ preset, onEdit, onDelete, onRun, onCopy }: PresetCardProps) {
  const isSnippet = preset.category?.toLowerCase() === 'snippet';
  const typeInfo = getPresetTypeInfo(preset);

  return (
    <Panel className="space-y-3 relative">
      {/* Type Icon - Top Left */}
      <div
        className={`absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-sm border ${typeInfo.bgColor} ${typeInfo.borderColor}`}
        title={typeInfo.label}
      >
        {typeInfo.icon}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pl-6">
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

        {/* Category Badge */}
        {preset.category && !isSnippet && (
          <Badge color="gray">{preset.category}</Badge>
        )}
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
