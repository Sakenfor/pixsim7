import { memo, useState, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useShallow } from 'zustand/react/shallow';

import type { DraftSceneNode } from '@domain/sceneBuilder';
import { getNodePorts, getPortPosition } from '@domain/sceneBuilder/portConfig';

import { useValidationContextOptional } from '../../hooks/useValidationContext';
import { nodeRendererRegistry } from '../../lib/editor/nodeRendererRegistry';
import { useGraphStore } from '../../stores/graphStore';
import { selectNodeActions } from '../../stores/graphStore/selectors';


interface SceneNodeData {
  label: string;
  nodeType: string;
  isStart: boolean;
  draftNode: DraftSceneNode;
}

export const SceneNode = memo(({ id, data, selected }: NodeProps<SceneNodeData>) => {
  // Use selector with useShallow for stable action references
  const { updateNode } = useGraphStore(useShallow(selectNodeActions));
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(data.label);

  // Get dynamic port configuration for this node type
  const portConfig = getNodePorts(data.draftNode);

  // Get validation from context (O(1) lookup instead of O(n) full validation)
  const validationContext = useValidationContextOptional();
  const { issues: nodeIssues, highestSeverity } = useMemo(() => {
    if (validationContext) {
      return validationContext.getNodeIssues(id);
    }
    // Fallback when no validation context (shouldn't happen in normal usage)
    return { issues: [], highestSeverity: null };
  }, [validationContext, id]);

  // Memoize renderer lookup - only changes when nodeType changes
  const renderer = useMemo(
    () => nodeRendererRegistry.getOrDefault(data.nodeType),
    [data.nodeType]
  );

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditLabel(data.label);
  }, [data.label]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editLabel !== data.label && editLabel.trim()) {
      // Update label in draft
      updateNode(id, {
        metadata: {
          ...data.draftNode.metadata,
          label: editLabel.trim(),
        },
      });
    }
  }, [editLabel, data.label, data.draftNode, id, updateNode]);

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
        relative w-[200px] rounded-lg border-2 shadow-lg bg-white dark:bg-neutral-800
        transition-[border-color,box-shadow] duration-200
        ${selected ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700' : 'border-neutral-300 dark:border-neutral-600'}
      `}
    >
      {/* Start Node Badge */}
      {data.isStart && (
        <div className="absolute -top-3 -left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow z-10">
          START
        </div>
      )}

      {/* Validation Issue Badge */}
      {highestSeverity && (
        <div
          className={`
            absolute -top-3 -right-3 text-xs font-bold px-2 py-1 rounded-full shadow z-10
            ${highestSeverity === 'error' ? 'bg-red-500 text-white' : ''}
            ${highestSeverity === 'warning' ? 'bg-amber-500 text-white' : ''}
            ${highestSeverity === 'info' ? 'bg-blue-500 text-white' : ''}
          `}
          title={nodeIssues.map(i => i.message).join('\n')}
        >
          {highestSeverity === 'error' && '🔴'}
          {highestSeverity === 'warning' && '⚠️'}
          {highestSeverity === 'info' && 'ℹ️'}
          {nodeIssues.length > 1 && ` ${nodeIssues.length}`}
        </div>
      )}

      {/* Header */}
      <div
        className="px-3 py-2 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-t-lg border-b border-neutral-200 dark:border-neutral-700"
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full px-1 py-0.5 text-sm font-semibold bg-white dark:bg-neutral-700 border border-blue-500 rounded outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate cursor-text">
            {data.label}
          </div>
        )}
      </div>

      {/* Body - Dynamic Renderer from Registry (memoized lookup) */}
      {(() => {
        if (!renderer?.component) {
          return (
            <div className="px-3 py-3 text-center">
              <div className="text-red-500 text-xs font-medium">Renderer Missing</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Type: {data.nodeType}
              </div>
            </div>
          );
        }

        const RendererComponent = renderer.component;
        try {
          return (
            <RendererComponent
              node={data.draftNode}
              isSelected={selected}
              isStart={data.isStart}
              hasErrors={highestSeverity === 'error'}
            />
          );
        } catch (error) {
          console.error(`[SceneNode] Error rendering node '${id}':`, error);
          return (
            <div className="px-3 py-3 text-center">
              <div className="text-red-500 text-xs font-medium">Render Error</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            </div>
          );
        }
      })()}

      {/* Dynamic Input Handles */}
      {portConfig.inputs.map((port, index) => (
        <Handle
          key={port.id}
          type="target"
          position={Position[port.position.charAt(0).toUpperCase() + port.position.slice(1) as keyof typeof Position]}
          id={port.id}
          style={{
            ...getPortPosition(port, index, portConfig.inputs.length),
            backgroundColor: port.color,
          }}
          className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800"
          title={port.description || port.label}
        />
      ))}

      {/* Dynamic Output Handles */}
      {portConfig.outputs.map((port, index) => (
        <Handle
          key={port.id}
          type="source"
          position={Position[port.position.charAt(0).toUpperCase() + port.position.slice(1) as keyof typeof Position]}
          id={port.id}
          style={{
            ...getPortPosition(port, index, portConfig.outputs.length),
            backgroundColor: port.color,
          }}
          className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800"
          title={port.description || port.label}
        >
          {/* Port label for non-default ports */}
          {port.id !== 'default' && port.id !== 'input' && port.id !== 'output' && (
            <div
              className="absolute text-xs font-medium px-1 py-0.5 rounded whitespace-nowrap pointer-events-none"
              style={{
                [port.position === 'right' ? 'left' : 'right']: '100%',
                [port.position === 'right' ? 'marginLeft' : 'marginRight']: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: port.color,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              {port.label}
            </div>
          )}
        </Handle>
      ))}
    </div>
  );
});

SceneNode.displayName = 'SceneNode';
