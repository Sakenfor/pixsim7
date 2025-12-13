import React, { useMemo } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { type FeatureCapability } from '@lib/capabilities';
import { type PluginMeta } from '@lib/plugins/catalog';

interface DependencyGraphPanelProps {
  features: FeatureCapability[];
  plugins: PluginMeta[];
}

/**
 * DependencyGraphPanel - Visualizes relationships between features, routes, and plugins
 *
 * Shows:
 * - Features as blue nodes
 * - Plugins as purple nodes
 * - Feature→Plugin dependencies (consumesFeatures)
 * - Plugin→Feature dependencies (providesFeatures)
 */
export function DependencyGraphPanel({ features, plugins }: DependencyGraphPanelProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Create feature nodes
    features.forEach((feature, index) => {
      nodes.push({
        id: `feature-${feature.id}`,
        type: 'featureNode',
        position: {
          x: 100,
          y: index * 150,
        },
        data: {
          label: feature.name,
          featureId: feature.id,
          icon: feature.icon,
          category: feature.category,
        },
      });
    });

    // Create plugin nodes
    plugins.forEach((plugin, index) => {
      const pluginId = `${plugin.kind}-${plugin.id}`;
      nodes.push({
        id: `plugin-${pluginId}`,
        type: 'pluginNode',
        position: {
          x: 600,
          y: index * 150,
        },
        data: {
          label: plugin.label,
          pluginId: plugin.id,
          kind: plugin.kind,
          origin: plugin.origin,
          icon: plugin.icon,
        },
      });

      // Create edges for consumesFeatures (Plugin → Feature)
      if (plugin.consumesFeatures) {
        plugin.consumesFeatures.forEach(featureId => {
          edges.push({
            id: `${pluginId}-consumes-${featureId}`,
            source: `plugin-${pluginId}`,
            target: `feature-${featureId}`,
            type: 'smoothstep',
            label: 'consumes',
            animated: true,
            style: { stroke: '#8b5cf6' },
          });
        });
      }

      // Create edges for providesFeatures (Plugin → Feature)
      if (plugin.providesFeatures) {
        plugin.providesFeatures.forEach(featureId => {
          edges.push({
            id: `${pluginId}-provides-${featureId}`,
            source: `plugin-${pluginId}`,
            target: `feature-${featureId}`,
            type: 'smoothstep',
            label: 'provides',
            style: { stroke: '#10b981' },
          });
        });
      }
    });

    return { nodes, edges };
  }, [features, plugins]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      featureNode: FeatureNode,
      pluginNode: PluginNode,
    }),
    []
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
            if (node.type === 'featureNode') return '#3b82f6';
            if (node.type === 'pluginNode') return '#8b5cf6';
            return '#6b7280';
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
      <div className="flex items-center gap-2 mb-1">
        {data.icon && <span className="text-lg">{data.icon}</span>}
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
  kind: string;
  origin: string;
  icon?: string;
}

function PluginNode({ data }: { data: PluginNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg min-w-[200px]">
      <div className="flex items-center gap-2 mb-1">
        {data.icon && <span className="text-lg">{data.icon}</span>}
        <div className="font-semibold text-purple-900 dark:text-purple-100">
          {data.label}
        </div>
      </div>
      <div className="text-xs font-mono text-purple-700 dark:text-purple-300 mb-1">
        {data.pluginId}
      </div>
      <div className="flex gap-1">
        <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded">
          {data.kind}
        </div>
        <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded">
          {data.origin}
        </div>
      </div>
    </div>
  );
}
