import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useArcGraphStore, type ArcGraphState } from '../../stores/arcGraphStore';
import { nodeRendererRegistry } from '../../lib/graph/nodeRendererRegistry';
import type { ArcGraphNode } from '../../modules/arc-graph';

interface ArcNodeData {
  label: string;
  nodeType: string;
  isStart: boolean;
  arcNode: ArcGraphNode;
}

/**
 * ArcNode - ReactFlow wrapper component for arc graph nodes
 *
 * Similar to SceneNode but designed for arc/quest graphs:
 * - Uses ArcGraphNode types instead of DraftSceneNode
 * - Integrates with arcGraphStore
 * - Dynamically renders using nodeRendererRegistry
 * - Simpler port configuration (arc graphs use standard connections)
 */
export const ArcNode = memo(({ id, data, selected }: NodeProps<ArcNodeData>) => {
  const updateArcNode = useArcGraphStore((s: ArcGraphState) => s.updateArcNode);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(data.label);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditLabel(data.label);
  }, [data.label]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editLabel !== data.label && editLabel.trim()) {
      // Update label in arc node
      updateArcNode(id, {
        label: editLabel.trim(),
      });
    }
  }, [editLabel, data.label, id, updateArcNode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setEditLabel(data.label);
        setIsEditing(false);
      }
    },
    [data.label]
  );

  return (
    <div
      className={`
        relative w-[220px] rounded-lg border-2 shadow-lg bg-white dark:bg-neutral-800
        transition-all duration-200
        ${selected ? 'border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700' : 'border-neutral-300 dark:border-neutral-600'}
      `}
    >
      {/* Start Node Badge */}
      {data.isStart && (
        <div className="absolute -top-3 -left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow z-10">
          START
        </div>
      )}

      {/* Header */}
      <div
        className="px-3 py-2 bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 rounded-t-lg border-b border-neutral-200 dark:border-neutral-700"
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full px-1 py-0.5 text-sm font-semibold bg-white dark:bg-neutral-700 border border-indigo-500 rounded outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate cursor-text">
            {data.label}
          </div>
        )}
      </div>

      {/* Body - Dynamic Renderer from Registry */}
      {(() => {
        try {
          // Get renderer for this node type
          const renderer = nodeRendererRegistry.getOrDefault(data.nodeType);
          const RendererComponent = renderer?.component;

          if (!RendererComponent) {
            console.error(`[ArcNode] No renderer component available for node type '${data.nodeType}'`);
            return (
              <div className="px-3 py-3 text-center">
                <div className="text-red-500 text-xs font-medium">⚠️ Renderer Missing</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Type: {data.nodeType}
                </div>
              </div>
            );
          }

          return (
            <RendererComponent
              node={data.arcNode as any}
              isSelected={selected}
              isStart={data.isStart}
              hasErrors={false}
            />
          );
        } catch (error) {
          console.error(`[ArcNode] Error rendering node '${id}':`, error);
          return (
            <div className="px-3 py-3 text-center">
              <div className="text-red-500 text-xs font-medium">⚠️ Render Error</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            </div>
          );
        }
      })()}

      {/* Input Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800 !bg-indigo-500"
      />

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800 !bg-indigo-500"
      />
    </div>
  );
});

ArcNode.displayName = 'ArcNode';
