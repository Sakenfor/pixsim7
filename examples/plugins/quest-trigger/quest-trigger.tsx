/**
 * Quest Trigger Node Renderer Plugin
 *
 * Demonstrates:
 * - Rich visual representation of node data
 * - Lazy loading pattern for heavy components
 * - Preload priority for common use cases
 * - Dark mode support
 * - Responsive to node state (selected, error, etc.)
 */

import type { NodeRenderer, NodeRendererProps } from '@/lib/graph/nodeRendererRegistry';
import type { QuestTriggerNodeData, QuestObjective } from './quest-trigger';

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
  const data = node as unknown as QuestTriggerNodeData;

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

/**
 * Renderer registration
 */
export const questTriggerRenderer: NodeRenderer = {
  nodeType: 'quest-trigger',
  component: QuestTriggerRenderer,

  // Larger default size to accommodate quest information
  defaultSize: {
    width: 280,
    height: 200,
  },

  // Use default header (SceneNode provides label editing, etc.)
  customHeader: false,

  // Lazy loading pattern (commented out for this example)
  // In production, this would load a heavier component with more features
  /*
  loader: async () => {
    // Simulate heavy import with rich features
    const module = await import('./quest-trigger.renderer.full');
    return module.QuestTriggerRendererFull;
  },
  */

  // Preload priority: Medium-high (quests are commonly used)
  preloadPriority: 7,
};

/**
 * Example usage in graph editor:
 *
 * 1. Register the node type and renderer:
 * ```typescript
 * import { questTriggerNodeType } from './examples/plugins/quest-trigger/quest-trigger';
 * import { questTriggerRenderer } from './examples/plugins/quest-trigger/quest-trigger.tsx';
 * import { nodeTypeRegistry } from '@pixsim7/types';
 * import { nodeRendererRegistry } from '@/lib/graph/nodeRendererRegistry';
 *
 * // Register node type
 * nodeTypeRegistry.register(questTriggerNodeType);
 *
 * // Register renderer
 * nodeRendererRegistry.register(questTriggerRenderer);
 * ```
 *
 * 2. Preload commonly used renderers:
 * ```typescript
 * // Preload quest-related renderers before opening the graph editor
 * await nodeRendererRegistry.preload(['quest-trigger', 'quest-update']);
 * ```
 *
 * 3. Use async loading in the graph:
 * ```typescript
 * // In SceneNode component
 * const renderer = await nodeRendererRegistry.getAsync(data.nodeType);
 * const RendererComponent = renderer?.component ?? DefaultRenderer;
 * ```
 */
