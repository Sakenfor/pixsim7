import { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';
import { nodeTypeRegistry } from '@lib/registries';
import type { QuestNodeData } from '@/modules/arc-graph';

/**
 * Quest node renderer - shows quest objective information
 */
export function QuestNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  const typeDef = nodeTypeRegistry.getSync(node.type);
  const questNode = node as unknown as QuestNodeData;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Node Type Badge with Icon */}
      <div className="flex items-center gap-2">
        {typeDef?.icon && (
          <span className="text-2xl">{typeDef.icon}</span>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
            {questNode.label || 'Untitled Quest'}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Quest: {questNode.questId || 'None'}
          </div>
        </div>
      </div>

      {/* Scene Reference */}
      {questNode.sceneId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Scene:</span>
          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-medium">
            📍 {questNode.sceneId}
          </span>
        </div>
      )}

      {/* Objectives */}
      {questNode.objectiveIds && questNode.objectiveIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            🎯 Objectives:
          </div>
          <div className="space-y-0.5">
            {questNode.objectiveIds.slice(0, 3).map((objId, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded">
                • {objId}
              </div>
            ))}
            {questNode.objectiveIds.length > 3 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{questNode.objectiveIds.length - 3} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Relationship Requirements */}
      {questNode.relationshipRequirements && questNode.relationshipRequirements.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            💕 Relationship Requirements:
          </div>
          <div className="space-y-0.5">
            {questNode.relationshipRequirements.slice(0, 2).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded">
                <span className="font-medium">{req.characterId}</span>
                {req.minAffinity !== undefined && (
                  <span className="ml-1">≥{req.minAffinity} affinity</span>
                )}
                {req.minTrust !== undefined && (
                  <span className="ml-1">≥{req.minTrust} trust</span>
                )}
                {req.requiredFlags && req.requiredFlags.length > 0 && (
                  <span className="ml-1">+flags</span>
                )}
              </div>
            ))}
            {questNode.relationshipRequirements.length > 2 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{questNode.relationshipRequirements.length - 2} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quest Requirements (dependencies) */}
      {questNode.questRequirements && questNode.questRequirements.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            🔗 Dependencies:
          </div>
          <div className="space-y-0.5">
            {questNode.questRequirements.slice(0, 2).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded">
                {req.questId}
                {req.status && ` (${req.status})`}
                {req.minSteps !== undefined && ` ≥${req.minSteps} steps`}
              </div>
            ))}
            {questNode.questRequirements.length > 2 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{questNode.questRequirements.length - 2} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {questNode.description && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 italic border-t border-neutral-200 dark:border-neutral-700 pt-2">
          {questNode.description}
        </div>
      )}
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default QuestNodeRenderer;
