/**
 * Quest Trigger Node Renderer
 *
 * Renders a rich preview of quest trigger information in the arc graph.
 * Shows quest details, objectives, conditions, and rewards.
 */

import type { QuestTriggerNodeData, QuestObjective } from '@lib/plugins/questTriggerNode';

import type { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Quest Trigger Node Renderer Component
 *
 * Renders a rich preview of quest information in the graph
 */
export function QuestTriggerRenderer({
  node,
  isSelected,
  isStart,
  hasErrors,
}: NodeRendererProps) {
  // Cast node data to our custom type
  const metadata = node.metadata as Record<string, unknown> | undefined;
  const data = metadata?.questTriggerConfig as QuestTriggerNodeData | undefined;

  // If no config yet, show placeholder
  if (!data) {
    return (
      <div className="px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📜</span>
          <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Configure quest trigger...
          </div>
        </div>
      </div>
    );
  }

  // Action badge styling
  const actionColors = {
    start: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    complete: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    fail: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    update: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header with icon and action badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📜</span>
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {data.questTitle || 'Untitled Quest'}
          </div>
        </div>
        {data.action && (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[data.action]}`}>
            {data.action.toUpperCase()}
          </span>
        )}
      </div>

      {/* Quest ID */}
      {data.questId && (
        <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {data.questId}
          </span>
        </div>
      )}

      {/* Description preview */}
      {data.questDescription && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
          {data.questDescription}
        </div>
      )}

      {/* Objectives preview */}
      {data.objectives && data.objectives.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Objectives ({data.objectives.length})
          </div>
          <div className="space-y-0.5">
            {data.objectives.slice(0, 3).map((obj: QuestObjective) => (
              <div key={obj.id} className="flex items-start gap-1.5 text-xs">
                <span className="text-neutral-400 dark:text-neutral-500">•</span>
                <span className="text-neutral-600 dark:text-neutral-400 line-clamp-1">
                  {obj.description}
                  {obj.optional && (
                    <span className="ml-1 text-neutral-400 dark:text-neutral-500">(optional)</span>
                  )}
                </span>
              </div>
            ))}
            {data.objectives.length > 3 && (
              <div className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                +{data.objectives.length - 3} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rewards preview */}
      {data.rewards && (
        <div className="flex items-center gap-2 flex-wrap">
          {data.rewards.experience !== undefined && data.rewards.experience > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs">
              ⭐ {data.rewards.experience} XP
            </span>
          )}
          {data.rewards.items && data.rewards.items.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
              🎁 {data.rewards.items.length} items
            </span>
          )}
        </div>
      )}

      {/* Conditions indicator */}
      {data.conditions && (
        data.conditions.requiredFlags?.length ||
        data.conditions.forbiddenFlags?.length ||
        data.conditions.minLevel
      ) && (
        <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>🔒</span>
          <span>Has conditions</span>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {isSelected && (
          <div className="text-xs text-blue-600 dark:text-blue-400">
            Selected
          </div>
        )}

        {hasErrors && (
          <div className="text-xs text-red-600 dark:text-red-400 font-medium">
            ⚠ Validation errors
          </div>
        )}

        {isStart && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs font-medium">
            <span>▶</span> Start Node
          </div>
        )}
      </div>
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default QuestTriggerRenderer;
