/**
 * Prompt Block Graph Surface
 *
 * Visualizes parsed prompt blocks as a graph showing:
 * - Prompt node at the top
 * - Block nodes for each parsed block
 * - Edges showing containment and sequence
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
import type { PromptSegment } from '@/types/promptGraphs';
import { buildPromptSegmentGraph, getNodeColorByRole, getEdgeStyle } from '@/lib/graphs/promptGraphBuilder';
import { Handle, Position } from 'reactflow';

export interface PromptBlockGraphSurfaceProps {
  segments: PromptSegment[];
  versionId?: string;
  promptTitle?: string;
  includeRoleGroups?: boolean;
}

/**
 * PromptBlockGraphSurface - Main graph component
 */
export function PromptBlockGraphSurface({
  segments,
  versionId = 'unknown',
  promptTitle = 'Prompt',
  includeRoleGroups = false,
}: PromptBlockGraphSurfaceProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const graph = buildPromptSegmentGraph(segments, {
      versionId,
      promptTitle,
      includeRoleGroups,
    });

    // Convert to ReactFlow nodes
    const nodes: Node[] = graph.nodes.map((node, index) => {
      let position = { x: 0, y: 0 };

      if (node.kind === 'prompt') {
        // Prompt node at top center
        position = { x: 400, y: 50 };
      } else if (node.kind === 'segment') {
        // Segment nodes in a vertical chain
        const segmentIndex = node.segmentIndex ?? index;
        position = { x: 400, y: 200 + segmentIndex * 120 };
      } else if (node.kind === 'role') {
        // Role nodes on the left
        const roleIndex = graph.nodes.filter(n => n.kind === 'role').indexOf(node);
        position = { x: 100, y: 200 + roleIndex * 120 };
      }

      return {
        id: node.id,
        type: node.kind === 'prompt' ? 'promptNode' : node.kind === 'segment' ? 'segmentNode' : 'roleNode',
        position,
        data: {
          label: node.label,
          role: node.role,
          text: node.text,
          kind: node.kind,
        },
      };
    });

    // Convert to ReactFlow edges
    const edges: Edge[] = graph.edges.map((edge) => {
      const style = getEdgeStyle(edge.kind);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: edge.kind === 'next' ? 'smoothstep' : 'default',
        animated: edge.kind === 'next',
        style: {
          stroke: style.color,
          strokeWidth: style.width,
          strokeDasharray: style.dashed ? '5,5' : undefined,
        },
        label: edge.kind === 'role-group' ? undefined : edge.kind,
      };
    });

    return { nodes, edges };
  }, [segments, versionId, promptTitle, includeRoleGroups]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      promptNode: PromptNode,
      segmentNode: SegmentNode,
      roleNode: RoleNode,
    }),
    []
  );

  if (!segments || segments.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center text-neutral-500 dark:text-neutral-400">
          <p className="text-lg font-semibold mb-2">No segments to display</p>
          <p className="text-sm">Select a prompt version to visualize its structure</p>
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
            if (node.type === 'promptNode') return '#6366f1'; // indigo-500
            if (node.type === 'segmentNode') return getNodeColorByRole(nodeData.role);
            if (node.type === 'roleNode') return '#94a3b8'; // neutral-400
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

interface PromptNodeData {
  label: string;
}

function PromptNode({ data }: { data: PromptNodeData }) {
  return (
    <div className="px-6 py-4 rounded-lg border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-950 shadow-lg min-w-[200px]">
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-2">
        <span className="text-2xl">📝</span>
        <div>
          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
            Prompt
          </div>
          <div className="font-semibold text-neutral-900 dark:text-neutral-100">
            {data.label}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SegmentNodeData {
  label: string;
  role?: string;
  text?: string;
}

function SegmentNode({ data }: { data: SegmentNodeData }) {
  const bgColor = getNodeColorByRole(data.role);
  const isLightColor = ['#10b981', '#06b6d4', '#f59e0b'].includes(bgColor);

  return (
    <div
      className="px-4 py-3 rounded-md border-2 shadow-md min-w-[250px] max-w-[350px]"
      style={{
        borderColor: bgColor,
        backgroundColor: `${bgColor}15`,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="space-y-1">
        {data.role && (
          <div
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded inline-block"
            style={{
              backgroundColor: bgColor,
              color: isLightColor ? '#000' : '#fff',
            }}
          >
            {data.role}
          </div>
        )}
        <div className="text-sm text-neutral-900 dark:text-neutral-100 line-clamp-2">
          {data.label}
        </div>
      </div>
    </div>
  );
}

interface RoleNodeData {
  label: string;
}

function RoleNode({ data }: { data: RoleNodeData }) {
  return (
    <div className="px-4 py-2 rounded-full border-2 border-neutral-400 bg-neutral-100 dark:bg-neutral-800 shadow-md">
      <Handle type="source" position={Position.Right} />
      <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
        {data.label}
      </div>
    </div>
  );
}
