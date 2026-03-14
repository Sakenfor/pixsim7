import dagre from "@dagrejs/dagre";
import React, { useMemo } from "react";

import { Icon } from "@lib/icons";

import ReactFlow, {
  type Node,
  type Edge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from "reactflow";

import "reactflow/dist/style.css";
import { type FeatureCapability } from "@lib/capabilities";
import { type UnifiedPluginDescriptor } from "@lib/plugins/types";

interface DependencyGraphPanelProps {
  features: FeatureCapability[];
  plugins: UnifiedPluginDescriptor[];
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 200, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

/**
 * DependencyGraphPanel - Visualizes relationships between features, routes, and plugins
 *
 * Shows:
 * - Features as blue nodes
 * - Plugins as purple nodes
 * - Feature→Plugin dependencies (consumesFeatures)
 * - Plugin→Feature dependencies (providesFeatures)
 *
 * Layout is computed by dagre (left-to-right DAG).
 */
export function DependencyGraphPanel({
  features,
  plugins,
}: DependencyGraphPanelProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const rawNodes: Node[] = [];
    const edges: Edge[] = [];

    // Create feature nodes
    features.forEach((feature) => {
      rawNodes.push({
        id: `feature-${feature.id}`,
        type: "featureNode",
        position: { x: 0, y: 0 }, // will be overwritten by dagre
        data: {
          label: feature.name,
          featureId: feature.id,
          icon: feature.icon,
          category: feature.category,
        },
      });
    });

    // Create plugin nodes
    plugins.forEach((plugin) => {
      const pluginId = `${plugin.family}-${plugin.id}`;
      rawNodes.push({
        id: `plugin-${pluginId}`,
        type: "pluginNode",
        position: { x: 0, y: 0 },
        data: {
          label: plugin.name,
          pluginId: plugin.id,
          family: plugin.family,
          origin: plugin.origin,
          icon: plugin.icon,
        },
      });

      // Create edges for consumesFeatures (Plugin → Feature)
      if (plugin.consumesFeatures) {
        plugin.consumesFeatures.forEach((featureId) => {
          edges.push({
            id: `${pluginId}-consumes-${featureId}`,
            source: `plugin-${pluginId}`,
            target: `feature-${featureId}`,
            type: "smoothstep",
            label: "consumes",
            animated: true,
            style: { stroke: "#8b5cf6" },
          });
        });
      }

      // Create edges for providesFeatures (Plugin → Feature)
      if (plugin.providesFeatures) {
        plugin.providesFeatures.forEach((featureId) => {
          edges.push({
            id: `${pluginId}-provides-${featureId}`,
            source: `plugin-${pluginId}`,
            target: `feature-${featureId}`,
            type: "smoothstep",
            label: "provides",
            style: { stroke: "#10b981" },
          });
        });
      }
    });

    const nodes = layoutWithDagre(rawNodes, edges);
    return { nodes, edges };
  }, [features, plugins]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      featureNode: FeatureNode,
      pluginNode: PluginNode,
    }),
    [],
  );

  return (
    <div className="w-full h-full bg-neutral-50 dark:bg-neutral-900">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "featureNode") return "#3b82f6";
            if (node.type === "pluginNode") return "#8b5cf6";
            return "#6b7280";
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ============================================================================
// Feature Node Component
// ============================================================================

interface FeatureNodeData {
  label: string;
  featureId: string;
  icon?: string;
  category?: string;
}

function FeatureNode({ data }: { data: FeatureNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg min-w-[200px]">
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
      <div className="flex items-center gap-2 mb-1">
        {data.icon && <Icon name={data.icon} size={18} />}
        <div className="font-semibold text-blue-900 dark:text-blue-100">
          {data.label}
        </div>
      </div>
      <div className="text-xs font-mono text-blue-700 dark:text-blue-300 mb-1">
        {data.featureId}
      </div>
      {data.category && (
        <div className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded inline-block">
          {data.category}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Plugin Node Component
// ============================================================================

interface PluginNodeData {
  label: string;
  pluginId: string;
  family: string;
  origin: string;
  icon?: string;
}

function PluginNode({ data }: { data: PluginNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg min-w-[200px]">
      <Handle type="target" position={Position.Left} className="!bg-purple-500" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
      <div className="flex items-center gap-2 mb-1">
        {data.icon && <Icon name={data.icon} size={18} />}
        <div className="font-semibold text-purple-900 dark:text-purple-100">
          {data.label}
        </div>
      </div>
      <div className="text-xs font-mono text-purple-700 dark:text-purple-300 mb-1">
        {data.pluginId}
      </div>
      <div className="flex gap-1">
        <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded">
          {data.family}
        </div>
        <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded">
          {data.origin}
        </div>
      </div>
    </div>
  );
}
