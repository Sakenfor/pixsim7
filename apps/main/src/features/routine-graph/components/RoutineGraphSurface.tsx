/**
 * Routine Graph Surface
 *
 * ReactFlow-based visual editor for NPC routine graphs.
 * Uses separate selection store for UI state.
 */

import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnNodesChange,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useRoutineGraphStore, routineGraphSelectors } from '../stores/routineGraphStore';
import { useRoutineGraphSelectionStore } from '../stores/selectionStore';
import type { RoutineGraph, RoutineNodeType } from '../types';
import { getNodeTypeColor } from '../types';

import ActivityNodeRenderer from './nodes/ActivityNodeRenderer';
import DecisionNodeRenderer from './nodes/DecisionNodeRenderer';
import TimeSlotNodeRenderer from './nodes/TimeSlotNodeRenderer';

// ============================================================================
// Node Type Registration
// ============================================================================

const nodeTypes: NodeTypes = {
  time_slot: TimeSlotNodeRenderer,
  decision: DecisionNodeRenderer,
  activity: ActivityNodeRenderer,
};

// ============================================================================
// Conversion Helpers
// ============================================================================

function toFlowNodes(graph: RoutineGraph | null, selectedNodeId: string | null): Node[] {
  if (!graph) return [];

  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.nodeType,
    position: node.position,
    selected: node.id === selectedNodeId,
    data: {
      routineNode: node,
      isSelected: node.id === selectedNodeId,
    },
  }));
}

function toFlowEdges(graph: RoutineGraph | null): Edge[] {
  if (!graph) return [];

  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    animated: (edge.conditions?.length ?? 0) > 0,
    style: {
      stroke: edge.conditions?.length ? '#f59e0b' : '#6b7280',
      strokeWidth: 2,
    },
    data: { routineEdge: edge },
  }));
}

// ============================================================================
// Node Palette
// ============================================================================

interface NodePaletteProps {
  onAddNode: (type: RoutineNodeType) => void;
}

function NodePalette({ onAddNode }: NodePaletteProps) {
  const nodeTypeOptions: { type: RoutineNodeType; label: string; icon: string }[] = [
    { type: 'time_slot', label: 'Time Slot', icon: '🕐' },
    { type: 'decision', label: 'Decision', icon: '🔀' },
    { type: 'activity', label: 'Activity', icon: '🎯' },
  ];

  return (
    <div className="flex gap-1 p-2 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700">
      {nodeTypeOptions.map(({ type, label, icon }) => (
        <button
          key={type}
          onClick={() => onAddNode(type)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
                     hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          style={{ borderLeft: `3px solid ${getNodeTypeColor(type)}` }}
          title={`Add ${label} node`}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Graph Selector
// ============================================================================

interface GraphSelectorProps {
  graphs: RoutineGraph[];
  currentGraphId: string | null;
  onSelect: (graphId: string | null) => void;
  onNew: () => void;
}

function GraphSelector({ graphs, currentGraphId, onSelect, onNew }: GraphSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700">
      <select
        value={currentGraphId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600
                   bg-white dark:bg-neutral-700 min-w-[150px]"
      >
        <option value="">Select routine...</option>
        {graphs.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        onClick={onNew}
        className="px-2 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        + New
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RoutineGraphSurface() {
  // Data store
  const currentGraph = useRoutineGraphStore(routineGraphSelectors.currentGraph);
  const graphs = useRoutineGraphStore(routineGraphSelectors.graphList);
  const currentGraphId = useRoutineGraphStore((s) => s.currentGraphId);

  const {
    setCurrentGraph,
    createGraph,
    addNodeOfType,
    updateNode,
    connectNodes,
  } = useRoutineGraphStore();

  // Selection store (separate from data)
  const selectedNodeId = useRoutineGraphSelectionStore((s) => s.selectedNodeId);
  const { selectNode, clearSelection } = useRoutineGraphSelectionStore();

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync store → ReactFlow
  useEffect(() => {
    setNodes(toFlowNodes(currentGraph, selectedNodeId));
    setEdges(toFlowEdges(currentGraph));
  }, [currentGraph, selectedNodeId, setNodes, setEdges]);

  // Sync ReactFlow position changes → store
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Sync position changes back to store
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.id) {
          updateNode(change.id, { position: change.position });
        }
      });
    },
    [onNodesChange, updateNode]
  );

  // Handle edge connections
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectNodes(connection.source, connection.target);
    },
    [connectNodes]
  );

  // Handle node selection
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Create new graph
  const handleNewGraph = useCallback(() => {
    createGraph('New Routine');
  }, [createGraph]);

  // Add new node at center
  const handleAddNode = useCallback(
    (type: RoutineNodeType) => {
      if (!currentGraph) {
        // Create a new graph first
        handleNewGraph();
        return;
      }

      const position = {
        x: 250 + Math.random() * 100,
        y: 150 + currentGraph.nodes.length * 120,
      };
      const nodeId = addNodeOfType(type, position);
      if (nodeId) {
        selectNode(nodeId);
      }
    },
    [currentGraph, addNodeOfType, selectNode, handleNewGraph]
  );

  // MiniMap node color
  const getMinimapNodeColor = useCallback((node: Node) => {
    return getNodeTypeColor(node.type as RoutineNodeType);
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap nodeColor={getMinimapNodeColor} />

        {/* Top-left: Graph selector */}
        <Panel position="top-left">
          <GraphSelector
            graphs={graphs}
            currentGraphId={currentGraphId}
            onSelect={setCurrentGraph}
            onNew={handleNewGraph}
          />
        </Panel>

        {/* Top-center: Node palette */}
        <Panel position="top-center">
          <NodePalette onAddNode={handleAddNode} />
        </Panel>

        {/* Info panel when no graph */}
        {!currentGraph && (
          <Panel position="top-center" className="mt-20">
            <div className="p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-lg text-center">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                No routine selected
              </p>
              <button
                onClick={handleNewGraph}
                className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Create New Routine
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default RoutineGraphSurface;
