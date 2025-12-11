import { NodeRendererProps } from '@/lib/graph/nodeRendererRegistry';
import { nodeTypeRegistry } from '@/types';
import type { MilestoneNodeData } from '@/modules/arc-graph';

/**
 * Milestone node renderer - shows major story checkpoint information
 */
export function MilestoneNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  const typeDef = nodeTypeRegistry.getSync(node.type);
  const milestoneNode = node as unknown as MilestoneNodeData;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Node Type Badge with Icon */}
      <div className="flex items-center gap-2">
        {typeDef?.icon && (
          <span className="text-2xl">{typeDef.icon}</span>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
            {milestoneNode.label || 'Untitled Milestone'}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            ID: {milestoneNode.milestoneId || 'None'}
          </div>
        </div>
      </div>

      {/* Scene Reference */}
      {milestoneNode.sceneId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Scene:</span>
          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-medium">
            📍 {milestoneNode.sceneId}
          </span>
        </div>
      )}

      {/* Required Arcs */}
      {milestoneNode.requiredArcs && milestoneNode.requiredArcs.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            📖 Required Arcs:
          </div>
          <div className="space-y-0.5">
            {milestoneNode.requiredArcs.slice(0, 3).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded">
                {req.arcId} ≥ Stage {req.minStage}
              </div>
            ))}
            {milestoneNode.requiredArcs.length > 3 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{milestoneNode.requiredArcs.length - 3} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Required Quests */}
      {milestoneNode.requiredQuests && milestoneNode.requiredQuests.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            ⚔️ Required Quests:
          </div>
          <div className="space-y-0.5">
            {milestoneNode.requiredQuests.slice(0, 3).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded">
                {req.questId} ({req.status})
              </div>
            ))}
            {milestoneNode.requiredQuests.length > 3 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{milestoneNode.requiredQuests.length - 3} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {milestoneNode.description && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 italic border-t border-neutral-200 dark:border-neutral-700 pt-2">
          {milestoneNode.description}
        </div>
      )}
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default MilestoneNodeRenderer;
