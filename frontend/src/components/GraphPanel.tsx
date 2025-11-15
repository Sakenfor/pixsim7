import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import ReactFlow, {
  type Node,
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
import { Button } from '@pixsim7/ui';
import { useGraphStore, type GraphState } from '../stores/graphStore';
import { toFlowNodes, toFlowEdges, applyNodePositions } from '../modules/scene-builder/graphSync';
import { useToast } from '../stores/toastStore';
import { useSelectionStore } from '../stores/selectionStore';
import { SceneNode } from './nodes/SceneNode';
import { NodeGroup } from './nodes/NodeGroup';
import { Breadcrumbs } from './navigation/Breadcrumbs';
import type { DraftSceneNode, DraftEdge } from '../modules/scene-builder';
import { validateConnection, getValidationMessage } from '../modules/scene-builder/portValidation';
import { NodePalette, type NodeType } from './nodes/NodePalette';
import { previewBridge } from '../lib/preview-bridge';

// Node type registry
const nodeTypes: NodeTypes = {
  scene: SceneNode,
  group: NodeGroup,
};

// Default edge options (defined outside to avoid re-creating on every render)
const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
};

export function GraphPanel() {
  const toast = useToast();
  const { selectedNodeId, setSelectedNodeId } = useSelectionStore();
  const draft = useGraphStore((s: GraphState) => s.draft);
  const createDraft = useGraphStore((s: GraphState) => s.createDraft);
  const addNode = useGraphStore((s: GraphState) => s.addNode);
  const removeNode = useGraphStore((s: GraphState) => s.removeNode);
  const connectNodes = useGraphStore((s: GraphState) => s.connectNodes);
  const setStartNode = useGraphStore((s: GraphState) => s.setStartNode);
  const exportDraft = useGraphStore((s: GraphState) => s.exportDraft);
  const importDraft = useGraphStore((s: GraphState) => s.importDraft);
  const toRuntimeScene = useGraphStore((s: GraphState) => s.toRuntimeScene);
  const getCurrentZoomLevel = useGraphStore((s: GraphState) => s.getCurrentZoomLevel);
  const navigationStack = useGraphStore((s: GraphState) => s.navigationStack);

  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Convert draft to React Flow format (memoized)
  const flowNodes = useMemo(() => toFlowNodes(draft), [draft]);
  const flowEdges = useMemo(() => toFlowEdges(draft), [draft]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Ensure a draft exists
  useEffect(() => {
    if (!draft) {
      createDraft('Untitled Scene');
    }
  }, [draft, createDraft]);

  // Sync React Flow nodes/edges when draft changes
  // Apply filters: collapsed groups + zoom level
  useEffect(() => {
    if (!draft) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const currentZoomLevel = getCurrentZoomLevel();

    // Find collapsed groups
    const collapsedGroupIds = new Set<string>();
    draft.nodes.forEach((node) => {
      if (node.type === 'node_group' && (node as any).collapsed) {
        collapsedGroupIds.add(node.id);
      }
    });

    // Filter nodes based on zoom level and collapsed state
    const visibleNodes = flowNodes.filter((node) => {
      // Hide children of collapsed groups
      if (node.parentNode && collapsedGroupIds.has(node.parentNode)) {
        return false;
      }

      // Apply zoom level filtering
      if (currentZoomLevel) {
        // We're zoomed into a group - only show nodes inside that group
        if (node.parentNode === currentZoomLevel) {
          return true; // Node is a direct child of the current zoom group
        }
        if (node.id === currentZoomLevel) {
          return false; // Hide the group itself when zoomed into it
        }
        return false; // Hide all other nodes
      } else {
        // At root level - show only top-level nodes (no parent)
        return !node.parentNode;
      }
    });

    // Filter edges - hide edges connected to hidden nodes
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = flowEdges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    setNodes(visibleNodes);
    setEdges(visibleEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges, draft, getCurrentZoomLevel, navigationStack]);

  // Handle node position changes - sync back to draft
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      applyNodePositions(draft, changes, nodes);
    },
    [onNodesChange, nodes, draft]
  );

  // Handle edge creation with validation
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceHandle = connection.sourceHandle || 'default';
      const targetHandle = connection.targetHandle || 'input';

      // Find source and target nodes
      const sourceNode = draft?.nodes.find((n: DraftSceneNode) => n.id === connection.source);
      const targetNode = draft?.nodes.find((n: DraftSceneNode) => n.id === connection.target);

      if (!sourceNode || !targetNode) {
        toast.error('Node not found');
        return;
      }

      // Validate connection
      const validationResult = validateConnection(connection, sourceNode, targetNode);
      if (!validationResult.valid) {
        toast.error(`Invalid connection: ${getValidationMessage(validationResult)}`);
        return;
      }

      // Check for duplicate
      if (sourceNode?.connections?.includes(connection.target)) {
        toast.info('Connection already exists');
        return;
      }

      console.log('[GraphPanel] onConnect:', {
        source: connection.source,
        target: connection.target,
        sourceHandle,
        targetHandle,
      });

      try {
        connectNodes(connection.source, connection.target, {
          fromPort: sourceHandle,
          toPort: targetHandle,
        });
        toast.success(`Connected ${connection.source} → ${connection.target} (${sourceHandle})`);
      } catch (error) {
        toast.error('Failed to connect nodes');
      }
    },
    [toast, draft, connectNodes]
  );

  // Handle selection
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    if (nodes.length === 1) {
      setSelectedNodeId(nodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  // Add node (generic helper)
  const handleAddNode = useCallback(
    (nodeType: NodeType, position?: { x: number; y: number }) => {
      // Ensure we have a draft/scene to add into
      if (!draft) {
        createDraft('Untitled Scene');
      }

      const nextIndex = ((draft?.nodes.length ?? 0)) + 1;
      const id = `${nodeType}_${nextIndex}`;

      // Calculate position if not provided
      const nodePosition = position || {
        x: 120 + nextIndex * 40,
        y: 120 + nextIndex * 20,
      };

      addNode({
        id,
        type: nodeType === 'miniGame' ? 'video' : nodeType, // Map miniGame to video for now
        metadata: {
          label: `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} ${nextIndex}`,
          position: nodePosition,
        },
      });

      toast.success(`Added ${id}`);
    },
    [toast, draft, addNode, createDraft]
  );

  // Handle drop on canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow-nodetype') as NodeType;
      if (!nodeType) return;

      // Get the drop position relative to the React Flow canvas
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      handleAddNode(nodeType, position);
    },
    [screenToFlowPosition, handleAddNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // Set start node
  const handleSetStart = useCallback(() => {
    if (!selectedNodeId) {
      toast.warning('Select a node first');
      return;
    }

    setStartNode(selectedNodeId);
    toast.success(`Start node set: ${selectedNodeId}`);
  }, [selectedNodeId, toast, setStartNode]);

  // Delete selected node
  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) {
      toast.warning('Select a node first');
      return;
    }

    try {
      removeNode(selectedNodeId);
      toast.success(`Deleted ${selectedNodeId}`);
      setSelectedNodeId(null);
    } catch (error) {
      toast.error('Failed to delete node');
    }
  }, [selectedNodeId, toast, removeNode, setSelectedNodeId]);

  // Preview scene in game iframe
  const handlePreview = useCallback(() => {
    try {
      const scene = toRuntimeScene();
      if (!scene) {
        toast.error('No scene to preview');
        return;
      }

      const success = previewBridge.loadScene(scene, true);
      if (success) {
        toast.success('Scene sent to game preview');
      } else {
        toast.warning('Game iframe not available');
      }
    } catch (error) {
      toast.error(`Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [toast, toRuntimeScene]);

  // Export draft to JSON file
  const handleExportFile = useCallback(() => {
    try {
      const jsonString = exportDraft();
      if (!jsonString) {
        toast.error('Failed to export draft');
        return;
      }

      const filename = `${draft?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'scene'}_${Date.now()}.json`;

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported: ${filename}`);
    } catch (error) {
      toast.error(`Export error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [toast, draft, exportDraft]);

  // Import draft from JSON file
  const handleImportFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = importDraft(text);
        if (imported) {
          toast.success(`Imported: ${imported.title}`);
        }
      } catch (error) {
        toast.error(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    input.click();
  }, [toast, importDraft]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Breadcrumbs - appears when zoomed into a group */}
      <Breadcrumbs />

      {/* Toolbar */}
      <div className="border-b p-2 flex items-center gap-2 text-xs bg-neutral-50 dark:bg-neutral-800 z-10">
        <span className="font-semibold">Scene Graph</span>
        <Button
          size="sm"
          variant={showPalette ? 'primary' : 'secondary'}
          onClick={() => setShowPalette(!showPalette)}
        >
          {showPalette ? '✓ Palette' : 'Palette'}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleSetStart} disabled={!selectedNodeId}>
          Set Start
        </Button>
        <Button size="sm" variant="secondary" onClick={handleDeleteNode} disabled={!selectedNodeId}>
          Delete
        </Button>
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        <Button size="sm" variant="primary" onClick={handlePreview} disabled={!draft?.startNodeId}>
          ▶ Preview
        </Button>
        <Button
          size="sm"
          variant={showDebugPanel ? 'primary' : 'secondary'}
          onClick={() => setShowDebugPanel(!showDebugPanel)}
        >
          {showDebugPanel ? '✓ Debug' : 'Debug'}
        </Button>
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        <Button size="sm" variant="secondary" onClick={handleExportFile} disabled={!draft}>
          ↓ Export
        </Button>
        <Button size="sm" variant="secondary" onClick={handleImportFile}>
          ↑ Import
        </Button>
        <div className="ml-auto text-neutral-500">
          {draft?.startNodeId ? (
            <span>
              Start: <b>{draft.startNodeId}</b>
            </span>
          ) : (
            <span>No start node</span>
          )}
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 min-h-0 flex">
        {/* Node Palette Sidebar */}
        {showPalette && (
          <div className="w-64 border-r border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 overflow-y-auto">
            <NodePalette onNodeCreate={handleAddNode} />
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            minZoom={0.1}
            maxZoom={4}
          >
          <Background />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="bg-neutral-100 dark:bg-neutral-800"
          />
          </ReactFlow>
        </div>

        {/* Debug Panel */}
        {showDebugPanel && (
          <div className="absolute bottom-4 right-4 w-96 max-h-96 bg-white dark:bg-neutral-900 border-2 border-blue-500 rounded-lg shadow-xl overflow-hidden z-10">
            <div className="px-3 py-2 bg-blue-500 text-white font-semibold text-sm flex items-center justify-between">
              <span>Draft Edges (Debug)</span>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="text-white hover:text-blue-100 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-3 overflow-y-auto max-h-80 text-xs font-mono">
              {draft?.edges && draft.edges.length > 0 ? (
                <div className="space-y-2">
                  {draft.edges.map((edge: DraftEdge) => (
                    <div
                      key={edge.id}
                      className="p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800"
                    >
                      <div className="font-semibold text-blue-600 dark:text-blue-400">
                        {edge.id}
                      </div>
                      <div className="mt-1 text-neutral-700 dark:text-neutral-300">
                        <span className="text-green-600 dark:text-green-400">{edge.from}</span>
                        {' → '}
                        <span className="text-purple-600 dark:text-purple-400">{edge.to}</span>
                      </div>
                      <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                        <span className="text-amber-600 dark:text-amber-400">
                          {edge.meta?.fromPort || 'default'}
                        </span>
                        {' → '}
                        <span className="text-amber-600 dark:text-amber-400">
                          {edge.meta?.toPort || 'input'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-500 text-center py-4">
                  No edges in draft
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrap with ReactFlowProvider for useReactFlow hook
import { ReactFlowProvider } from 'reactflow';

export function GraphPanelWithProvider() {
  return (
    <ReactFlowProvider>
      <GraphPanel />
    </ReactFlowProvider>
  );
}
