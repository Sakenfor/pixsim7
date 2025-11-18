import { NodeRendererProps } from '../../lib/graph/nodeRendererRegistry';
import { nodeTypeRegistry } from '@pixsim7/types';

/**
 * Default node body renderer - used as fallback for node types without custom renderers
 */
export function DefaultNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  const typeDef = nodeTypeRegistry.get(node.type);
  const nodeId = node.id;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Node Type Badge with Icon */}
      <div className="flex items-center gap-2">
        {typeDef?.icon && (
          <span className="text-2xl">{typeDef.icon}</span>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">Type:</span>
            <span className={`px-2 py-0.5 rounded font-medium ${typeDef?.bgColor || 'bg-blue-100 dark:bg-blue-900/50'} ${typeDef?.color || 'text-blue-700 dark:text-blue-300'}`}>
              {typeDef?.name || node.type}
            </span>
          </div>
        </div>
      </div>

      {/* NPC Metadata Hints */}
      {(node.metadata?.speakerRole || node.metadata?.npc_id || node.metadata?.npc_state) && (
        <div className="flex flex-wrap gap-1 text-xs">
          {node.metadata?.speakerRole && (
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded font-medium" title="Speaker Role">
              👤 {node.metadata.speakerRole}
            </span>
          )}
          {node.metadata?.npc_id && (
            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded font-medium" title="Hard NPC Binding">
              🔒 NPC #{node.metadata.npc_id}
            </span>
          )}
          {node.metadata?.npc_state && (
            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded font-medium" title="NPC Expression State">
              😊 {node.metadata.npc_state}
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
