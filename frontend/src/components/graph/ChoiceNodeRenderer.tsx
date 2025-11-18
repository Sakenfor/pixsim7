import { NodeRendererProps } from '../../lib/graph/nodeRendererRegistry';

/**
 * Custom renderer for choice nodes - shows available choices
 */
export function ChoiceNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  const choices = (node.metadata?.choices as any[]) || [];
  const hasChoices = choices.length > 0;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header with icon */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🔀</span>
        <div className="flex-1">
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Player Choice
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {hasChoices ? `${choices.length} option${choices.length !== 1 ? 's' : ''}` : 'No choices configured'}
          </div>
        </div>
      </div>

      {/* Choice List */}
      {hasChoices ? (
        <div className="space-y-1.5">
          {choices.slice(0, 3).map((choice, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800"
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-purple-500 text-white text-xs font-bold rounded-full">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {choice.text || `Choice ${index + 1}`}
                </div>
                {choice.targetNodeId && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    → {choice.targetNodeId}
                  </div>
                )}
              </div>
            </div>
          ))}
          {choices.length > 3 && (
            <div className="text-xs text-center text-neutral-500 dark:text-neutral-400 py-1">
              +{choices.length - 3} more choice{choices.length - 3 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-neutral-400 dark:text-neutral-500">
          <div className="text-3xl mb-1">🔀</div>
          <div className="text-xs">Add choices in inspector</div>
        </div>
      )}

      {/* Node ID */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
        ID: {node.id}
      </div>
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default ChoiceNodeRenderer;
