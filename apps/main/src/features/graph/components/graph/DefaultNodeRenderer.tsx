import { Icon } from '@lib/icons';
import { arcNodeTypeRegistry, sceneNodeTypeRegistry } from '@lib/registries';

import type { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Default node body renderer - used as fallback for node types without custom renderers
 */
export function DefaultNodeRenderer({ node }: NodeRendererProps<unknown>) {
  const nodeRecord = node as Record<string, unknown>;
  const nodeType = typeof nodeRecord.type === 'string' ? nodeRecord.type : 'unknown';
  const nodeId = typeof nodeRecord.id === 'string' ? nodeRecord.id : 'unknown';
  const metadata = typeof nodeRecord.metadata === 'object' && nodeRecord.metadata !== null
    ? (nodeRecord.metadata as Record<string, unknown>)
    : undefined;

  const typeDef = sceneNodeTypeRegistry.getSync(nodeType) ?? arcNodeTypeRegistry.getSync(nodeType);

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Node Type Badge with Icon */}
      <div className="flex items-center gap-2">
        {typeDef?.icon && (
          <Icon name={typeDef.icon} size={24} />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">Type:</span>
            <span className={`px-2 py-0.5 rounded font-medium ${typeDef?.bgColor || 'bg-blue-100 dark:bg-blue-900/50'} ${typeDef?.color || 'text-blue-700 dark:text-blue-300'}`}>
              {typeDef?.name || nodeType}
            </span>
          </div>
        </div>
      </div>

      {/* NPC Metadata Hints */}
      {(metadata?.speakerRole || metadata?.npc_id || metadata?.npc_state) && (
        <div className="flex flex-wrap gap-1 text-xs">
          {typeof metadata?.speakerRole === 'string' && (
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded font-medium" title="Speaker Role">
              dY` {metadata.speakerRole}
            </span>
          )}
          {metadata?.npc_id !== undefined && (
            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded font-medium" title="Hard NPC Binding">
              dY"' NPC #{String(metadata.npc_id)}
            </span>
          )}
          {typeof metadata?.npc_state === 'string' && (
            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded font-medium" title="NPC Expression State">
              dY~S {metadata.npc_state}
            </span>
          )}
        </div>
      )}

      {/* Node ID */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        ID: {nodeId}
      </div>

      {/* Type Description */}
      {typeDef?.description && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 italic">
          {typeDef.description}
        </div>
      )}
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default DefaultNodeRenderer;
