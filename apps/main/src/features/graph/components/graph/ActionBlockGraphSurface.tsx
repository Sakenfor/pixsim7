/**
 * Action Block Graph Surface
 *
 * Visualizes ActionBlocks and their relationships:
 * - Block nodes for each ActionBlock
 * - Package grouping nodes (optional)
 * - Compatibility edges (can-follow)
 * - Composition edges (composed-of)
 * - Extraction edges (extracted-from)
 *
 * Part of Task 81 - Prompt & Action Block Graph Surfaces
 */

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
import type { ActionBlock } from '@/types/promptGraphs';
import {
  buildActionBlockGraph,
  getNodeColorByComplexity,
  getCompositeNodeStyle,
  getActionEdgeStyle,
} from '../../lib/builders/actionGraphBuilder';
import { Handle, Position } from 'reactflow';

export interface ActionBlockGraphSurfaceProps {
  blocks: ActionBlock[];
  includePackages?: boolean;
  includePromptVersions?: boolean;
}

/**
 * ActionBlockGraphSurface - Main graph component
 */
export function ActionBlockGraphSurface({
  blocks,
  includePackages = true,
  includePromptVersions = false,
}: ActionBlockGraphSurfaceProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const graph = buildActionBlockGraph(blocks, {
      includePackages,
      includePromptVersions,
    });

    // Group blocks by package for layout
    const packageGroups = new Map<string, typeof graph.nodes>();
    const packageNodes = graph.nodes.filter(n => n.kind === 'package');
    const blockNodes = graph.nodes.filter(n => n.kind === 'block');
    const pvNodes = graph.nodes.filter(n => n.kind === 'prompt-version');

    // Group blocks by package
    blockNodes.forEach(node => {
      const pkg = node.packageName || 'unknown';
      if (!packageGroups.has(pkg)) {
        packageGroups.set(pkg, []);
      }
      packageGroups.get(pkg)!.push(node);
    });

    // Convert to ReactFlow nodes
    const nodes: Node[] = [];

    // Position package nodes
    let pkgX = 100;
    packageNodes.forEach((pkgNode, pkgIndex) => {
      nodes.push({
        id: pkgNode.id,
        type: 'packageNode',
        position: { x: pkgX, y: 50 },
        data: {
          label: pkgNode.label,
          packageName: pkgNode.packageName,
        },
      });

      // Position blocks in this package
      const blocksInPkg = packageGroups.get(pkgNode.packageName || '') || [];
      blocksInPkg.forEach((blockNode, blockIndex) => {
        nodes.push({
          id: blockNode.id,
          type: 'actionBlockNode',
          position: { x: pkgX, y: 150 + blockIndex * 120 },
          data: {
            label: blockNode.label,
            complexity: blockNode.complexity,
            isComposite: blockNode.isComposite,
            packageName: blockNode.packageName,
          },
        });
      });

      pkgX += 350; // Move to next column
    });

    // Handle blocks without packages
    const orphanBlocks = blockNodes.filter(n => !n.packageName || n.packageName === 'unknown');
    if (orphanBlocks.length > 0 && !includePackages) {
      orphanBlocks.forEach((blockNode, blockIndex) => {
        nodes.push({
          id: blockNode.id,
          type: 'actionBlockNode',
          position: { x: 100 + (blockIndex % 3) * 300, y: 100 + Math.floor(blockIndex / 3) * 120 },
          data: {
            label: blockNode.label,
            complexity: blockNode.complexity,
            isComposite: blockNode.isComposite,
          },
        });
      });
    }

    // Position prompt version nodes
    pvNodes.forEach((pvNode, pvIndex) => {
      nodes.push({
        id: pvNode.id,
        type: 'promptVersionNode',
        position: { x: pkgX, y: 100 + pvIndex * 100 },
        data: {
          label: pvNode.label,
        },
      });
    });

    // Convert to ReactFlow edges
    const edges: Edge[] = graph.edges.map((edge) => {
      const style = getActionEdgeStyle(edge.kind);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: edge.kind === 'can-follow' ? 'smoothstep' : 'default',
        animated: edge.kind === 'can-follow',
        style: {
          stroke: style.color,
          strokeWidth: style.width,
          strokeDasharray: style.dashed ? '5,5' : undefined,
        },
        label: edge.kind,
        labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
        labelStyle: { fontSize: 10, fontWeight: 600 },
      };
    });

    return { nodes, edges };
  }, [blocks, includePackages, includePromptVersions]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      actionBlockNode: ActionBlockNode,
      packageNode: PackageNode,
      promptVersionNode: PromptVersionNode,
    }),
    []
  );

  if (!blocks || blocks.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center text-neutral-500 dark:text-neutral-400">
          <p className="text-lg font-semibold mb-2">No ActionBlocks to display</p>
          <p className="text-sm">Load ActionBlocks to visualize their relationships</p>
        </div>
      </div>
    );
  }

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
            const nodeData = node.data as any;
            if (node.type === 'actionBlockNode') return getNodeColorByComplexity(nodeData.complexity);
            if (node.type === 'packageNode') return '#8b5cf6'; // violet-500
            if (node.type === 'promptVersionNode') return '#06b6d4'; // cyan-500
            return '#6b7280';
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ============================================================================
// Node Components
// ============================================================================

interface ActionBlockNodeData {
  label: string;
  complexity?: string;
  isComposite?: boolean;
  packageName?: string;
}

function ActionBlockNode({ data }: { data: ActionBlockNodeData }) {
  const bgColor = getNodeColorByComplexity(data.complexity);
  const borderStyle = getCompositeNodeStyle(data.isComposite);
  const isLightColor = ['#10b981', '#f59e0b'].includes(bgColor);

  return (
    <div
      className="px-4 py-3 rounded-md shadow-md min-w-[200px] max-w-[280px]"
      style={{
        borderColor: bgColor,
        borderWidth: borderStyle.borderWidth,
        borderStyle: borderStyle.borderStyle,
        backgroundColor: `${bgColor}15`,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {data.complexity && (
            <div
              className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{
                backgroundColor: bgColor,
                color: isLightColor ? '#000' : '#fff',
              }}
            >
              {data.complexity}
            </div>
          )}
          {data.isComposite && (
            <div className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-violet-500 text-white">
              Composite
            </div>
          )}
        </div>
        <div className="text-sm font-mono text-neutral-900 dark:text-neutral-100 break-all">
          {data.label}
        </div>
        {data.packageName && (
          <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
            📦 {data.packageName}
          </div>
        )}
      </div>
    </div>
  );
}

interface PackageNodeData {
  label: string;
  packageName?: string;
}

function PackageNode({ data }: { data: PackageNodeData }) {
  return (
    <div className="px-5 py-3 rounded-lg border-2 border-violet-500 bg-violet-50 dark:bg-violet-950 shadow-lg min-w-[180px]">
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-2">
        <span className="text-xl">📦</span>
        <div>
          <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
            Package
          </div>
          <div className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
            {data.label}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PromptVersionNodeData {
  label: string;
}

function PromptVersionNode({ data }: { data: PromptVersionNodeData }) {
  return (
    <div className="px-4 py-2 rounded-md border-2 border-cyan-500 bg-cyan-50 dark:bg-cyan-950 shadow-md min-w-[160px]">
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-2">
        <span className="text-lg">📄</span>
        <div>
          <div className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
            Prompt Version
          </div>
          <div className="text-xs text-neutral-900 dark:text-neutral-100 font-mono">
            {data.label}
          </div>
        </div>
      </div>
    </div>
  );
}
