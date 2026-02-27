import type { ComponentProps } from 'react';
import type { Edge, Node } from 'reactflow';
import ReactFlow from 'reactflow';

type ReactFlowProps = ComponentProps<typeof ReactFlow>;

export interface GraphCanvasAdapter<
  TNode extends Node = Node,
  TEdge extends Edge = Edge,
> {
  nodes: TNode[];
  edges: TEdge[];
  onNodeClick?: ReactFlowProps['onNodeClick'];
  onNodeDragStop?: ReactFlowProps['onNodeDragStop'];
  onConnect?: ReactFlowProps['onConnect'];
  onNodesDelete?: ReactFlowProps['onNodesDelete'];
  onEdgesDelete?: ReactFlowProps['onEdgesDelete'];
}

export interface GraphDomainAdapter<
  TNode extends Node = Node,
  TEdge extends Edge = Edge,
> extends GraphCanvasAdapter<TNode, TEdge> {
  onNodesChange?: ReactFlowProps['onNodesChange'];
  onEdgesChange?: ReactFlowProps['onEdgesChange'];
  onPaneClick?: ReactFlowProps['onPaneClick'];
  nodeTypes?: ReactFlowProps['nodeTypes'];
  defaultEdgeOptions?: ReactFlowProps['defaultEdgeOptions'];
  snapToGrid?: ReactFlowProps['snapToGrid'];
  snapGrid?: ReactFlowProps['snapGrid'];
}

export function toGraphCanvasProps<
  TNode extends Node = Node,
  TEdge extends Edge = Edge,
>(adapter: GraphCanvasAdapter<TNode, TEdge>) {
  return {
    nodes: adapter.nodes,
    edges: adapter.edges,
    onNodeClick: adapter.onNodeClick,
    onNodeDragStop: adapter.onNodeDragStop,
    onConnect: adapter.onConnect,
    onNodesDelete: adapter.onNodesDelete,
    onEdgesDelete: adapter.onEdgesDelete,
  };
}

export function toReactFlowProps<
  TNode extends Node = Node,
  TEdge extends Edge = Edge,
>(adapter: GraphCanvasAdapter<TNode, TEdge> & Partial<GraphDomainAdapter<TNode, TEdge>>) {
  return {
    ...toGraphCanvasProps(adapter),
    onNodesChange: adapter.onNodesChange,
    onEdgesChange: adapter.onEdgesChange,
    onPaneClick: adapter.onPaneClick,
    nodeTypes: adapter.nodeTypes,
    defaultEdgeOptions: adapter.defaultEdgeOptions,
    snapToGrid: adapter.snapToGrid,
    snapGrid: adapter.snapGrid,
  };
}
