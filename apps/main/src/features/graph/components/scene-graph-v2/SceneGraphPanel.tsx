import { Button, useToast } from '@pixsim7/shared.ui';
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
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ReactFlowProvider } from 'reactflow';

import { previewBridge } from '@lib/preview-bridge';
import { nodeTypeRegistry } from '@lib/registries';
import { logEvent } from '@lib/utils/logging';

import {
  useGraphStore,
  type GraphState,
  NodePalette,
  type NodeType,
  ValidationProvider,
} from '@features/graph';
import { useSelectionStore } from '@features/graph';
import { GraphTemplatePalette, TemplateWizardPalette } from '@features/graph';
import { useTemplateStore } from '@features/graph' // templatesStore';
import { useTemplateAnalyticsStore } from '@features/graph' // templateAnalyticsStore';
import { EdgeEffectsPanel } from '@features/panels/components/tools/EdgeEffectsPanel';
import { ValidationPanel } from '@features/panels/components/tools/ValidationPanel';
import { useWorldContextStore } from '@features/scene';

import { WorldContextSelector } from '@/components/game/WorldContextSelector';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';

import type { DraftSceneNode, DraftEdge } from '@domain/sceneBuilder';
import { toFlowNodes, toFlowEdges, extractPositionUpdates } from '@domain/sceneBuilder/graphSync';
import { validateConnection, getValidationMessage } from '@domain/sceneBuilder/portValidation';



import { defaultEdgeOptions, nodeTypes } from './sceneGraphPanelConfig';
import { useSceneGraphPanelHandlers } from './useSceneGraphPanelHandlers';

export function SceneGraphPanel() {
  const toast = useToast();
  const { selectedNodeId, selectedNodeIds, setSelectedNodeId, setSelectedNodeIds } = useSelectionStore();
  const { worldId } = useWorldContextStore();
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const createScene = useGraphStore((s: GraphState) => s.createScene);
  const addNode = useGraphStore((s: GraphState) => s.addNode);
  const updateNode = useGraphStore((s: GraphState) => s.updateNode);
  const removeNode = useGraphStore((s: GraphState) => s.removeNode);
  const connectNodes = useGraphStore((s: GraphState) => s.connectNodes);
  const setStartNode = useGraphStore((s: GraphState) => s.setStartNode);
  const exportScene = useGraphStore((s: GraphState) => s.exportScene);
  const importScene = useGraphStore((s: GraphState) => s.importScene);
  const toRuntimeScene = useGraphStore((s: GraphState) => s.toRuntimeScene);
  const getCurrentZoomLevel = useGraphStore((s: GraphState) => s.getCurrentZoomLevel);
  const navigationStack = useGraphStore((s: GraphState) => s.navigationStack);
  const addTemplate = useTemplateStore((state) => state.addTemplate);
  const recordUsage = useTemplateAnalyticsStore((state) => state.recordUsage);

  // Get current scene (derived from currentSceneId)
  const currentScene = getCurrentScene();

  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [showTemplatePalette, setShowTemplatePalette] = useState(false);
  const [showWizardPalette, setShowWizardPalette] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Extracted handlers: template ops, file I/O, keyboard shortcuts
  const {
    handleExportFile,
    handleImportFile,
    handleSaveAsTemplate,
    handleInsertTemplate,
    handleWizardComplete,
  } = useSceneGraphPanelHandlers({
    currentScene,
    currentSceneId,
    worldId,
    selectedNodeIds,
    exportScene,
    importScene,
    getCurrentScene,
    addTemplate,
    recordUsage,
    addNode,
    connectNodes,
    setSelectedNodeIds,
  });

  // Convert current scene to React Flow format (memoized)
  const flowNodes = useMemo(() => toFlowNodes(currentScene), [currentScene]);
  const flowEdges = useMemo(() => toFlowEdges(currentScene), [currentScene]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Ensure a scene exists
  useEffect(() => {
    if (!currentSceneId) {
      createScene('Untitled Scene');
    }
  }, [currentSceneId, createScene]);

  // Sync React Flow nodes/edges when scene changes
  // Apply filters: collapsed groups + zoom level
  useEffect(() => {
    if (!currentScene) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const currentZoomLevel = getCurrentZoomLevel();

    // Find collapsed groups
    const collapsedGroupIds = new Set<string>();
    currentScene.nodes.forEach((node) => {
      if (node.type === 'node_group' && 'collapsed' in node && node.collapsed) {
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
  }, [flowNodes, flowEdges, setNodes, setEdges, currentScene, getCurrentZoomLevel, navigationStack]);

  // Handle node position changes - sync back to scene via store actions
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      // Extract position updates and apply via updateNode action
      const positionUpdates = extractPositionUpdates(changes, nodes);
      positionUpdates.forEach(({ nodeId, position }) => {
        const node = currentScene?.nodes.find(n => n.id === nodeId);
        if (node) {
          updateNode(nodeId, {
            metadata: {
              ...node.metadata,
              position,
            },
          });
        }
      });
    },
    [onNodesChange, nodes, currentScene, updateNode]
  );

  // Handle edge creation with validation
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceHandle = connection.sourceHandle || 'default';
      const targetHandle = connection.targetHandle || 'input';

      // Find source and target nodes
      const sourceNode = currentScene?.nodes.find((n: DraftSceneNode) => n.id === connection.source);
      const targetNode = currentScene?.nodes.find((n: DraftSceneNode) => n.id === connection.target);

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

      try {
        logEvent('DEBUG', 'graph_connection', {
          source: connection.source,
          target: connection.target,
          sourceHandle,
          targetHandle,
        });
        connectNodes(connection.source, connection.target, {
          fromPort: sourceHandle,
          toPort: targetHandle,
        });
        toast.success(`Connected ${connection.source} → ${connection.target} (${sourceHandle})`);
      } catch {
        toast.error('Failed to connect nodes');
      }
    },
    [toast, currentScene, connectNodes]
  );

  // Handle selection
  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => {
      const nodeIds = nodes.map((n) => n.id);
      setSelectedNodeIds(nodeIds);

      // Maintain backward compatibility with single selection
      if (nodes.length === 1) {
        setSelectedNodeId(nodes[0].id);
      } else {
        setSelectedNodeId(null);
      }
    },
    [setSelectedNodeId, setSelectedNodeIds]
  );

  // Add node (generic helper)
  const handleAddNode = useCallback(
    (nodeType: NodeType, position?: { x: number; y: number }) => {
      // Ensure we have a scene to add into
      if (!currentSceneId) {
        createScene('Untitled Scene');
        toast.info('Creating new scene. Please click again to add node.');
        return; // Exit early - scene creation is async
      }

      if (!currentScene) {
        toast.error('No active scene');
        return;
      }

      // Get node type definition from registry
      const nodeTypeDef = nodeTypeRegistry.getSync(nodeType);

      const nextIndex = currentScene.nodes.length + 1;
      const id = `${nodeType}_${nextIndex}`;

      // Calculate position if not provided
      const nodePosition = position || {
        x: 120 + nextIndex * 40,
        y: 120 + nextIndex * 20,
      };

      // Create node with default data from registry
      const resolvedType = nodeType === 'miniGame'
        ? 'video'
        : (nodeType as DraftSceneNode['type']);

      const defaultData = nodeTypeDef?.defaultData as Record<string, unknown> | undefined;
      const defaultMetadata = (defaultData?.metadata ?? {}) as Record<string, unknown>;

      const newNode = {
        id,
        type: resolvedType, // Map miniGame to video for backwards compatibility
        metadata: {
          label: `${nodeTypeDef?.name || nodeType} ${nextIndex}`,
          position: nodePosition,
          ...defaultMetadata,
        },
        // Merge in default data from registry (excluding metadata which we handle separately)
        ...(defaultData ? Object.fromEntries(
          Object.entries(defaultData).filter(([key]) => key !== 'metadata')
        ) : {}),
      } as DraftSceneNode;

      addNode(newNode);

      toast.success(`Added ${id}`);
    },
    [toast, currentScene, currentSceneId, addNode, createScene]
  );

  // Handle drop on canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      // Get the drop position relative to the React Flow canvas
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Check if dropping a node type from palette
      const nodeType = event.dataTransfer.getData('application/reactflow-nodetype') as NodeType;
      if (nodeType) {
        handleAddNode(nodeType, position);
        return;
      }

      // Check if dropping a scene from library (to create scene_call node)
      const sceneCallData = event.dataTransfer.getData('application/reactflow-scene-call');
      if (sceneCallData) {
        try {
          const { sceneId, sceneTitle } = JSON.parse(sceneCallData);

          if (!currentScene) {
            toast.error('No active scene');
            return;
          }

          // Create a scene_call node
          const nextIndex = currentScene.nodes.length + 1;
          const id = `scene_call_${nextIndex}`;

          addNode({
            id,
            type: 'scene_call',
            targetSceneId: sceneId,
            parameterBindings: {},
            returnRouting: {},
            metadata: {
              label: `Call: ${sceneTitle}`,
              position,
            },
          });

          toast.success(`Created scene call to "${sceneTitle}"`);
        } catch {
          toast.error('Failed to create scene call node');
        }
        return;
      }
    },
    [screenToFlowPosition, handleAddNode, currentScene, addNode, toast]
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
    } catch {
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

  return (
    <div className="h-full w-full flex flex-col">
      {/* Breadcrumbs - appears when zoomed into a group */}
      <Breadcrumbs />

      {/* Toolbar */}
      <div className="border-b p-2 flex items-center gap-2 text-xs bg-neutral-50 dark:bg-neutral-800 z-10">
        <span className="font-semibold">Scene Graph</span>
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        <WorldContextSelector />
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
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
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSaveAsTemplate}
          disabled={selectedNodeIds.length === 0}
          title="Save selected nodes as template"
        >
          💾 Template
        </Button>
        <Button
          size="sm"
          variant={showTemplatePalette ? 'primary' : 'secondary'}
          onClick={() => setShowTemplatePalette(!showTemplatePalette)}
          title="Show/hide template palette"
        >
          {showTemplatePalette ? '✓ Templates' : 'Templates'}
        </Button>
        <Button
          size="sm"
          variant={showWizardPalette ? 'primary' : 'secondary'}
          onClick={() => setShowWizardPalette(!showWizardPalette)}
          title="Show/hide pattern wizards"
        >
          {showWizardPalette ? '✓ Wizards' : '🧙 Wizards'}
        </Button>
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        <Button size="sm" variant="primary" onClick={handlePreview} disabled={!currentScene?.startNodeId}>
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
        <ValidationPanel />
        <EdgeEffectsPanel />
        <div className="border-l border-neutral-300 dark:border-neutral-600 h-6 mx-1" />
        <Button size="sm" variant="secondary" onClick={handleExportFile} disabled={!currentScene}>
          ↓ Export
        </Button>
        <Button size="sm" variant="secondary" onClick={handleImportFile}>
          ↑ Import
        </Button>
        <div className="ml-auto text-neutral-500">
          {currentScene?.startNodeId ? (
            <span>
              Start: <b>{currentScene.startNodeId}</b>
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

        {/* Template Palette Sidebar */}
        {showTemplatePalette && (
          <div className="w-80 border-r border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 overflow-y-auto">
            <GraphTemplatePalette
              onInsertTemplate={handleInsertTemplate}
              worldId={worldId}
              currentScene={currentScene}
            />
          </div>
        )}

        {/* Phase 7: Wizard Palette Sidebar */}
        {showWizardPalette && (
          <div className="w-80 border-r border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 overflow-y-auto">
            <TemplateWizardPalette onWizardComplete={handleWizardComplete} />
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 h-full min-h-0" ref={reactFlowWrapper}>
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
            className="w-full h-full"
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
              {currentScene?.edges && currentScene.edges.length > 0 ? (
                <div className="space-y-2">
                  {currentScene.edges.map((edge: DraftEdge) => (
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
                  No edges in scene
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

export function SceneGraphPanelWithProvider() {
  return (
    <ReactFlowProvider>
      <ValidationProvider>
        <SceneGraphPanel />
      </ValidationProvider>
    </ReactFlowProvider>
  );
}
