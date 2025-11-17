import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { logEvent } from '../../lib/logging';
import type { NodeGroupData } from '../../modules/scene-builder';

interface NodeGroupNodeData {
  label: string;
  nodeType: 'node_group';
  draftNode: NodeGroupData;
}

/**
 * NodeGroup Component - React Flow Parent Node
 *
 * Uses React Flow's native parent node system:
 * - Child nodes have parentNode property set to this group's id
 * - Children are positioned relative to this node
 * - Children are constrained to parent boundaries (extent: 'parent')
 *
 * Features:
 * - Collapse/expand to hide/show children
 * - Visual container with header
 * - Zoom navigation
 */
export const NodeGroup = memo(({ id, data, selected }: NodeProps<NodeGroupNodeData>) => {
  const toggleGroupCollapsed = useGraphStore((s: GraphState) => s.toggleGroupCollapsed);
  const getGroupChildren = useGraphStore((s: GraphState) => s.getGroupChildren);
  const zoomIntoGroup = useGraphStore((s: GraphState) => s.zoomIntoGroup);
  const [isHovered, setIsHovered] = useState(false);

  const groupNode = data.draftNode;
  const childNodes = getGroupChildren(id);

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleGroupCollapsed(id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Zoom into this group
    logEvent('DEBUG', 'node_group_zoom', { groupId: id });
    zoomIntoGroup(id);
  };

  return (
    <div
      className={`
        relative w-full h-full rounded-xl border-2 shadow-xl transition-all duration-200
        ${selected ? 'ring-4 ring-blue-300 dark:ring-blue-700' : ''}
        ${isHovered ? 'shadow-2xl' : ''}
      `}
      style={{
        borderColor: groupNode.color || '#3b82f6',
        backgroundColor: 'rgba(249, 250, 251, 0.9)', // Light background for children visibility
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={handleDoubleClick}
    >
      {/* Header - Always visible */}
      <div
        className="px-4 py-2 rounded-t-xl cursor-pointer select-none border-b-2"
        style={{
          backgroundColor: groupNode.color || '#3b82f6',
          borderBottomColor: groupNode.color || '#3b82f6',
          color: 'white',
        }}
        onClick={handleToggleCollapse}
      >
        <div className="flex items-center gap-3">
          {/* Icon & Collapse Arrow */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{groupNode.icon || '📁'}</span>
            <span className="text-sm">
              {groupNode.collapsed ? '▶' : '▼'}
            </span>
          </div>

          {/* Label */}
          <div className="flex-1">
            <div className="font-bold text-sm">
              {data.label}
            </div>
            <div className="text-xs opacity-90">
              {childNodes.length} node{childNodes.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Zoom button */}
          <button
            className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
            onClick={handleDoubleClick}
            title="Zoom into group (or double-click)"
          >
            🔍
          </button>
        </div>
      </div>

      {/* Body - Container for child nodes (React Flow will render children here) */}
      {!groupNode.collapsed && (
        <div className="p-4 w-full h-full overflow-hidden">
          {/* React Flow automatically renders child nodes here */}
          {/* We don't manually render them - they're part of the React Flow graph */}

          {/* Optional: Show description at bottom */}
          {groupNode.description && (
            <div className="absolute bottom-2 left-2 right-2 text-xs text-neutral-600 dark:text-neutral-400 bg-white/80 dark:bg-neutral-800/80 px-2 py-1 rounded">
              {groupNode.description}
            </div>
          )}
        </div>
      )}

      {/* Collapsed State - Show summary */}
      {groupNode.collapsed && (
        <div className="p-3 text-center">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Click to expand
          </div>
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800"
        style={{ backgroundColor: groupNode.color || '#3b82f6' }}
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800"
        style={{ backgroundColor: groupNode.color || '#3b82f6' }}
      />
    </div>
  );
});

NodeGroup.displayName = 'NodeGroup';
