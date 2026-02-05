/**
 * RoutineNode - ReactFlow wrapper component for routine graph nodes
 *
 * Similar to SceneNode/ArcNode but for routine graphs:
 * - Uses RoutineNode types instead of DraftSceneNode
 * - Integrates with routineGraphStore
 * - Dynamically renders handles based on port configuration from registry
 * - Delegates body rendering to specific node renderers
 */

import { getNodePorts, getPortPositionStyle } from '@pixsim7/shared.graph.core';
import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';


import type { RoutineNode as RoutineNodeType } from '../../types';
import { getNodeTypeColor, getNodeTypeLabel } from '../../types';

import { ActivityNodeBody } from './ActivityNodeRenderer';
import { DecisionNodeBody } from './DecisionNodeRenderer';
import { TimeSlotNodeBody } from './TimeSlotNodeRenderer';

export interface RoutineNodeData {
  routineNode: RoutineNodeType;
  isSelected: boolean;
}

interface RoutineNodeRendererProps {
  node: RoutineNodeType;
  isSelected: boolean;
}

type NodeRendererComponent = React.ComponentType<RoutineNodeRendererProps>;

// Body renderers by node type
const bodyRenderers: Record<string, NodeRendererComponent> = {
  time_slot: TimeSlotNodeBody,
  decision: DecisionNodeBody,
  activity: ActivityNodeBody,
};

/**
 * RoutineNode wrapper that handles dynamic ports for all routine node types
 */
export const RoutineNode = memo(function RoutineNode({ data, selected }: NodeProps<RoutineNodeData>) {
  const { routineNode } = data;
  const nodeType = routineNode.nodeType;
  const color = getNodeTypeColor(nodeType);

  // Get dynamic port configuration for this node type
  const portConfig = useMemo(
    () => getNodePorts(nodeType, routineNode, { flowDirection: 'top-to-bottom' }),
    [nodeType, routineNode]
  );

  // Get body renderer for this node type
  const BodyRenderer = bodyRenderers[nodeType];

  return (
    <div
      className={`
        min-w-[160px] rounded-lg border-2 bg-white dark:bg-neutral-800
        shadow-md transition-shadow
        ${selected ? 'shadow-lg ring-2 ring-offset-1' : ''}
      `}
      style={{
        borderColor: color,
        ...(selected ? { '--tw-ring-color': color } as React.CSSProperties : {}),
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}20` }}
      >
        <span className="text-xs font-semibold" style={{ color }}>
          {getNodeTypeLabel(nodeType)}
        </span>
      </div>

      {/* Body - rendered by specific node renderer */}
      {BodyRenderer ? (
        <BodyRenderer node={routineNode} isSelected={selected} />
      ) : (
        <div className="px-3 py-2">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {routineNode.label || `Unnamed ${getNodeTypeLabel(nodeType)}`}
          </div>
        </div>
      )}

      {/* Dynamic Input Handles */}
      {portConfig.inputs.map((port, index) => (
        <Handle
          key={port.id}
          type="target"
          position={Position[port.position.charAt(0).toUpperCase() + port.position.slice(1) as keyof typeof Position]}
          id={port.id}
          style={{
            ...getPortPositionStyle(port, index, portConfig.inputs.length),
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
            ...getPortPositionStyle(port, index, portConfig.outputs.length),
            backgroundColor: port.color,
          }}
          className="!w-3 !h-3 !border-2 !border-white dark:!border-neutral-800"
          title={port.description || port.label}
        >
          {/* Port label for branch outputs */}
          {portConfig.outputs.length > 1 && (
            <div
              className="absolute text-[10px] font-medium px-1 py-0.5 rounded whitespace-nowrap pointer-events-none bg-white/90 dark:bg-neutral-800/90"
              style={{
                left: '100%',
                marginLeft: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: port.color,
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

export default RoutineNode;
