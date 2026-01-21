import { Button, useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  type Node,
  type Edge,
  type Connection,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { ArcGraph, ArcGraphEdge, ArcGraphNode } from '@features/graph/models/arcGraph';

import { arcNodeTypeRegistry } from '../../lib/nodeTypes/arcRegistry';
import { useArcGraphStore, type ArcGraphState } from '../../stores/arcGraphStore';
import { ArcNode } from '../nodes/ArcNode';
import { NodePalette } from '../nodes/NodePalette';

// Default edge options
const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
};

/**
 * Convert arc graph nodes to React Flow format
 */
function toFlowNodes(arcGraph: ArcGraph | null): Node[] {
  if (!arcGraph?.nodes) return [];

  return arcGraph.nodes.map((node: ArcGraphNode) => ({
    id: node.id,
    type: 'arc',
    position: node.position || { x: 0, y: 0 },
    data: {
      label: node.label,
      nodeType: node.type,
      isStart: arcGraph.startNodeId === node.id,
      arcNode: node,
    },
  }));
}

/**
 * Convert arc graph edges to React Flow format
 */
function toFlowEdges(arcGraph: ArcGraph | null): Edge[] {
  if (!arcGraph?.edges) return [];

  return arcGraph.edges.map((edge: ArcGraphEdge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: edge.meta?.style || 'smoothstep',
    animated: false,
    style: {
      stroke: edge.meta?.color || '#6366f1',
    },
  }));
}

/**
 * ArcGraphPanel - Modern arc/quest graph editor
 *
 * Features:
 * - ReactFlow-based visual graph editor
 * - Uses ArcNode wrapper with specialized node renderers
 * - Integrates with arcGraphStore for state management
 * - Node palette for adding arc/quest/milestone nodes
 * - Export/import functionality
 * - Navigation to referenced scenes
 */
export function ArcGraphPanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Arc graph store
  const currentArcGraphId = useArcGraphStore((s: ArcGraphState) => s.currentArcGraphId);
  const getCurrentArcGraph = useArcGraphStore((s: ArcGraphState) => s.getCurrentArcGraph);
  const createArcGraph = useArcGraphStore((s: ArcGraphState) => s.createArcGraph);
  const addArcNode = useArcGraphStore((s: ArcGraphState) => s.addArcNode);
  const updateArcNode = useArcGraphStore((s: ArcGraphState) => s.updateArcNode);
  const removeArcNode = useArcGraphStore((s: ArcGraphState) => s.removeArcNode);
  const connectArcNodes = useArcGraphStore((s: ArcGraphState) => s.connectArcNodes);
  const setStartArcNode = useArcGraphStore((s: ArcGraphState) => s.setStartArcNode);
  const exportArcGraph = useArcGraphStore((s: ArcGraphState) => s.exportArcGraph);
  const importArcGraph = useArcGraphStore((s: ArcGraphState) => s.importArcGraph);

  const currentGraph = getCurrentArcGraph();

  const [showPalette, setShowPalette] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Node types for React Flow
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      arc: ArcNode,
    }),
    []
  );

  // Convert arc graph to React Flow format
  const flowNodes = useMemo(() => toFlowNodes(currentGraph), [currentGraph]);
  const flowEdges = useMemo(() => toFlowEdges(currentGraph), [currentGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Ensure an arc graph exists
  useEffect(() => {
    if (!currentArcGraphId) {
      createArcGraph('Main Arc Graph');
    }
  }, [currentArcGraphId, createArcGraph]);

  // Sync React Flow nodes/edges when graph changes
  useEffect(() => {
    if (!currentGraph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    setNodes(toFlowNodes(currentGraph));
    setEdges(toFlowEdges(currentGraph));
  }, [currentGraph, setNodes, setEdges]);

  // Handle node position changes
  useEffect(() => {
    const handleNodeDragStop = () => {
      nodes.forEach((flowNode) => {
        updateArcNode(flowNode.id, {
          position: flowNode.position,
        });
      });
    };

    // Debounce position updates
    const timeout = setTimeout(handleNodeDragStop, 300);
    return () => clearTimeout(timeout);
  }, [nodes, updateArcNode]);

  // Handle connections between nodes
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      connectArcNodes(connection.source, connection.target);
      toast.success('Nodes connected');
    },
    [connectArcNodes, toast]
  );

  // Handle node double-click (drill-down to scene)
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const arcNode = node.data.arcNode as ArcGraphNode;

      if (arcNode.type === 'arc' && arcNode.sceneId) {
        toast.info(`Opening scene: ${arcNode.sceneId}`);
        navigate(`/workspace?scene=${arcNode.sceneId}`);
      } else if (arcNode.type === 'quest' && arcNode.sceneId) {
        toast.info(`Opening scene: ${arcNode.sceneId}`);
        navigate(`/workspace?scene=${arcNode.sceneId}`);
      } else if (arcNode.type === 'milestone' && arcNode.sceneId) {
        toast.info(`Opening scene: ${arcNode.sceneId}`);
        navigate(`/workspace?scene=${arcNode.sceneId}`);
      } else {
        toast.warning('No scene reference set for this node');
      }
    },
    [navigate, toast]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  // Handle adding nodes from palette
  const handleAddNode = useCallback(
    (nodeTypeId: string, position?: { x: number; y: number }) => {
      const nodeTypeDef = arcNodeTypeRegistry.getSync(nodeTypeId);
      if (!nodeTypeDef) {
        toast.error(`Node type ${nodeTypeId} not found`);
        return;
      }

      const finalPosition = position || { x: 100, y: 100 };

      const nodeId = crypto.randomUUID();
      let newNode: ArcGraphNode;

      switch (nodeTypeId) {
        case 'arc_group':
          newNode = {
            id: nodeId,
            type: 'arc_group',
            label: `New ${nodeTypeDef.name}`,
            position: finalPosition,
            childNodeIds: [],
            collapsed: false,
            ...nodeTypeDef.defaultData,
          };
          break;
        case 'quest':
          newNode = {
            id: nodeId,
            type: 'quest',
            label: `New ${nodeTypeDef.name}`,
            position: finalPosition,
            questId: '',
            ...nodeTypeDef.defaultData,
          };
          break;
        case 'milestone':
          newNode = {
            id: nodeId,
            type: 'milestone',
            label: `New ${nodeTypeDef.name}`,
            position: finalPosition,
            milestoneId: '',
            ...nodeTypeDef.defaultData,
          };
          break;
        case 'arc':
        default:
          newNode = {
            id: nodeId,
            type: 'arc',
            label: `New ${nodeTypeDef.name}`,
            position: finalPosition,
            arcId: '',
            ...nodeTypeDef.defaultData,
          };
          break;
      }

      addArcNode(newNode);
      toast.success(`Added ${nodeTypeDef.name} node`);
    },
    [addArcNode, toast]
  );

  // Handle drag over for drag-and-drop
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop for drag-and-drop
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeTypeId = event.dataTransfer.getData('application/reactflow-nodetype');
      if (!nodeTypeId || !reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      handleAddNode(nodeTypeId, position);
    },
    [screenToFlowPosition, handleAddNode]
  );

  // Handle export
  const handleExport = useCallback(() => {
    if (!currentArcGraphId) return;

    const json = exportArcGraph(currentArcGraphId);
    if (!json) return;

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arc-graph-${currentArcGraphId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Arc graph exported');
  }, [currentArcGraphId, exportArcGraph, toast]);

  // Handle import
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        const graphId = importArcGraph(json);
        if (graphId) {
          toast.success('Arc graph imported');
        } else {
          toast.error('Failed to import arc graph');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importArcGraph, toast]);

  // Handle delete node
  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;

    removeArcNode(selectedNodeId);
    setSelectedNodeId(null);
    toast.success('Node deleted');
  }, [selectedNodeId, removeArcNode, toast]);

  // Handle set start node
  const handleSetStartNode = useCallback(() => {
    if (!selectedNodeId) return;

    setStartArcNode(selectedNodeId);
    toast.success('Start node set');
  }, [selectedNodeId, setStartArcNode, toast]);

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          Arc Graph Editor
        </h2>
        <div className="flex-1" />

        <Button onClick={() => setShowPalette(!showPalette)} size="sm">
          {showPalette ? 'Hide' : 'Show'} Palette
        </Button>

        {selectedNodeId && (
          <>
            <Button onClick={handleSetStartNode} size="sm">
              Set Start
            </Button>
            <Button onClick={handleDeleteNode} size="sm" variant="outline">
              Delete
            </Button>
          </>
        )}

        <Button onClick={handleExport} size="sm">
          Export
        </Button>
        <Button onClick={handleImport} size="sm">
          Import
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex relative">
        {/* Node Palette */}
        {showPalette && (
          <NodePalette
            onNodeCreate={handleAddNode}
            registry={arcNodeTypeRegistry}
            scope="arc"
          />
        )}

        {/* React Flow Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeClick={onNodeClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
