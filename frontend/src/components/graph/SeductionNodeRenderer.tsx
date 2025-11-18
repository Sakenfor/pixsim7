/**
 * Seduction Node Renderer
 *
 * Renders a rich preview of seduction node information in the scene graph.
 * Shows stages, current progress, and affinity requirements.
 */

import type { NodeRendererProps } from '../../lib/graph/nodeRendererRegistry';
import type { SeductionNodeData, SeductionStage } from '../../lib/plugins/seductionNode';

/**
 * Seduction Node Renderer Component
 *
 * Renders a rich preview of seduction stages in the graph
 */
export function SeductionNodeRenderer({
  node,
  isSelected,
  isStart,
  hasErrors,
}: NodeRendererProps) {
  // Cast node data to our custom type
  const data = (node as any).stages
    ? (node as SeductionNodeData)
    : undefined;

  // If no config yet, show placeholder
  if (!data || !data.stages || data.stages.length === 0) {
    return (
      <div className="px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💕</span>
          <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Configure seduction stages...
          </div>
        </div>
      </div>
    );
  }

  const currentStage = data.currentStage || 0;
  const totalStages = data.stages.length;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header with icon and progress */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💕</span>
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Seduction
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300">
          {currentStage + 1} / {totalStages}
        </span>
      </div>

      {/* Affinity flag indicator */}
      {data.affinityCheckFlag && (
        <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {data.affinityCheckFlag}
          </span>
        </div>
      )}

      {/* Stages preview */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Stages ({totalStages})
        </div>
        <div className="space-y-0.5">
          {data.stages.slice(0, 3).map((stage: SeductionStage, index: number) => {
            const isCurrent = index === currentStage;
            const isCompleted = index < currentStage;

            return (
              <div
                key={stage.id}
                className={`flex items-start gap-1.5 text-xs ${
                  isCurrent
                    ? 'font-medium text-pink-600 dark:text-pink-400'
                    : isCompleted
                    ? 'text-neutral-400 dark:text-neutral-500 line-through'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                <span className="text-neutral-400 dark:text-neutral-500">
                  {isCurrent ? '▶' : isCompleted ? '✓' : '○'}
                </span>
                <span className="flex-1 line-clamp-1">
                  {stage.name}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  isCurrent
                    ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}>
                  {stage.requiredAffinity}
                </span>
              </div>
            );
          })}
          {totalStages > 3 && (
            <div className="text-xs text-neutral-400 dark:text-neutral-500 italic">
              +{totalStages - 3} more...
            </div>
          )}
        </div>
      </div>

      {/* Routing info */}
      {(data.successTargetNodeId || data.failureTargetNodeId) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {data.successTargetNodeId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
              ✓ Success
            </span>
          )}
          {data.failureTargetNodeId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
              ✗ Failure
            </span>
          )}
          {data.allowRetry && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
              🔄 Retry
            </span>
          )}
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
