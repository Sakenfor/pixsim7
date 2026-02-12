import { Icon } from '@lib/icons';
import { arcNodeTypeRegistry } from '@lib/registries';

import type { ArcNodeData } from '@features/graph/models/arcGraph';

import type { ArcNodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Type guard to check if a node is an ArcNodeData
 */
function isArcNodeData(node: unknown): node is ArcNodeData {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as Record<string, unknown>;
  return (
    n.type === 'arc' &&
    typeof n.id === 'string' &&
    typeof n.arcId === 'string' &&
    typeof n.label === 'string'
  );
}

/**
 * Arc node renderer - shows arc/story beat information
 */
export function ArcNodeRenderer({ node }: ArcNodeRendererProps) {
  const typeDef = arcNodeTypeRegistry.getSync(node.type);

  // Validate node is actually an ArcNodeData
  if (!isArcNodeData(node)) {
    console.error('[ArcNodeRenderer] Invalid arc node data:', node);
    return (
      <div className="px-3 py-3 text-center">
        <div className="text-red-500 text-xs font-medium">⚠️ Invalid Arc Node</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Missing required arc data fields
        </div>
      </div>
    );
  }

  const arcNode = node;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Node Type Badge with Icon */}
      <div className="flex items-center gap-2">
        {typeDef?.icon && (
          <Icon name={typeDef.icon} size={24} />
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
            {arcNode.label || 'Untitled Arc'}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Arc: {arcNode.arcId || 'None'}
          </div>
        </div>
      </div>

      {/* Stage Badge */}
      {arcNode.stage !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Stage:</span>
          <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-medium">
            {arcNode.stage}
          </span>
        </div>
      )}

      {/* Scene Reference */}
      {arcNode.sceneId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Scene:</span>
          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-medium">
            📍 {arcNode.sceneId}
          </span>
        </div>
      )}

      {/* Relationship Requirements */}
      {arcNode.relationshipRequirements && arcNode.relationshipRequirements.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            💕 Relationship Requirements:
          </div>
          <div className="space-y-0.5">
            {arcNode.relationshipRequirements.slice(0, 2).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded">
                <span className="font-medium">{req.characterId}</span>
                {req.minAffinity !== undefined && (
                  <span className="ml-1">≥{req.minAffinity} affinity</span>
                )}
                {req.minTrust !== undefined && (
                  <span className="ml-1">≥{req.minTrust} trust</span>
                )}
              </div>
            ))}
            {arcNode.relationshipRequirements.length > 2 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{arcNode.relationshipRequirements.length - 2} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quest Requirements */}
      {arcNode.questRequirements && arcNode.questRequirements.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            ⚔️ Quest Requirements:
          </div>
          <div className="space-y-0.5">
            {arcNode.questRequirements.slice(0, 2).map((req, idx) => (
              <div key={idx} className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded">
                {req.questId}
                {req.status && ` (${req.status})`}
                {req.minSteps !== undefined && ` ≥${req.minSteps} steps`}
              </div>
            ))}
            {arcNode.questRequirements.length > 2 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                +{arcNode.questRequirements.length - 2} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Required Flags */}
      {arcNode.requiredFlags && arcNode.requiredFlags.length > 0 && (
        <div className="text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Flags: </span>
          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded font-medium">
            {arcNode.requiredFlags.length} required
          </span>
        </div>
      )}

      {/* Description */}
      {arcNode.description && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 italic border-t border-neutral-200 dark:border-neutral-700 pt-2">
          {arcNode.description}
        </div>
      )}
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default ArcNodeRenderer;

