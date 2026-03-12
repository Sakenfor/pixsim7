import type {
  FlowBlockedStep,
  FlowCandidateTemplate,
  FlowNextStep,
  FlowNode,
  FlowRunSummary,
  FlowSuggestedPath,
  FlowTemplate,
} from '@pixsim7/shared.types';
import { memo, useMemo } from 'react';
import {
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow';

import { GraphCanvasShell } from '@/features/graph/components/graph/GraphCanvasShell';
import type { GraphDomainAdapter } from '@/features/graph/components/graph/graphDomainAdapter';
import { useGraphCanvasAdapter } from '@/features/graph/hooks/useGraphCanvasAdapter';

interface JourneyTemplateCanvasProps {
  template: FlowTemplate | null;
  candidate?: FlowCandidateTemplate;
  nextStep?: FlowNextStep;
  blockedStep?: FlowBlockedStep;
  suggestedPath?: FlowSuggestedPath;
  latestRun?: FlowRunSummary;
}

interface PositionedNode {
  node: FlowNode;
  x: number;
  y: number;
}

interface JourneyNodeData {
  label: string;
  kind: FlowNode['kind'];
  isStart: boolean;
  isProgressed: boolean;
  isSuggested: boolean;
  isNext: boolean;
  isBlocked: boolean;
  isLatest: boolean;
}

interface JourneyVisualState {
  progressed: Set<string>;
  suggestedNodes: Set<string>;
  suggestedEdges: Set<string>;
  nextNodeId?: string;
  blockedNodeId?: string;
  blockedEdgeId?: string;
  latestNodeId?: string;
}

const NODE_WIDTH = 184;
const NODE_HEIGHT = 84;
const NODE_GAP_X = 72;
const NODE_GAP_Y = 34;
const CANVAS_MARGIN = 36;
const JOURNEY_NODE_TYPE = 'journey-node';
const HIDDEN_HANDLE_CLASS = '!w-2 !h-2 !bg-transparent !border-0 !opacity-0 !pointer-events-none';

const nodeTypes: NodeTypes = {
  [JOURNEY_NODE_TYPE]: memo(JourneyNodeRenderer),
};

export function JourneyTemplateCanvas({
  template,
  candidate,
  nextStep,
  blockedStep,
  suggestedPath,
  latestRun,
}: JourneyTemplateCanvasProps) {
  const model = useMemo(() => buildCanvasModel(template), [template]);

  const state = useMemo(
    () => buildJourneyVisualState(candidate, nextStep, blockedStep, suggestedPath, latestRun),
    [blockedStep, candidate, latestRun, nextStep, suggestedPath]
  );

  const flowNodes = useMemo<Node<JourneyNodeData>[]>(() => {
    if (!template || !model) return [];

    return model.nodes.map((positioned) => {
      const { node } = positioned;
      return {
        id: node.id,
        type: JOURNEY_NODE_TYPE,
        position: { x: positioned.x, y: positioned.y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        connectable: false,
        selectable: false,
        data: {
          label: node.label,
          kind: node.kind,
          isStart: node.id === template.start_node_id,
          isProgressed: state.progressed.has(node.id),
          isSuggested: state.suggestedNodes.has(node.id),
          isNext: state.nextNodeId === node.id,
          isBlocked: state.blockedNodeId === node.id,
          isLatest: state.latestNodeId === node.id,
        },
      };
    });
  }, [model, state, template]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!model) return [];

    return model.edges
      .map((edge) => {
        if (!model.nodesById[edge.from] || !model.nodesById[edge.to]) {
          return null;
        }

        const edgeKey = `${edge.from}->${edge.to}`;
        const isSuggested = state.suggestedEdges.has(edgeKey);
        const isBlocked = state.blockedEdgeId === edge.id;
        const stroke = isBlocked ? '#f43f5e' : isSuggested ? '#0ea5e9' : '#9ca3af';

        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: 'smoothstep',
          label: edge.condition,
          animated: isSuggested,
          style: {
            stroke,
            strokeWidth: isBlocked || isSuggested ? 2.2 : 1.5,
            opacity: isBlocked || isSuggested ? 1 : 0.82,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
          },
          labelStyle: {
            fontSize: 10,
            fontWeight: 600,
            fill: isBlocked ? '#be123c' : isSuggested ? '#0369a1' : '#525252',
          },
          labelShowBg: Boolean(edge.condition),
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          labelBgStyle: {
            fill: 'rgba(255,255,255,0.88)',
            fillOpacity: 0.95,
          },
        } satisfies Edge;
      })
      .filter((edge): edge is Edge => edge !== null);
  }, [model, state.blockedEdgeId, state.suggestedEdges]);

  const graphDomainAdapter = useGraphCanvasAdapter<GraphDomainAdapter>(
    () => ({
      nodes: flowNodes,
      edges: flowEdges,
      nodeTypes,
    }),
    [flowEdges, flowNodes]
  );

  if (!template || !model) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a template to render its journey graph.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-gradient-to-br from-white via-slate-50 to-cyan-50 dark:from-neutral-900 dark:via-neutral-900 dark:to-slate-900 p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {template.label}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            <code>{template.id}</code> - domain{' '}
            <span className="font-medium">{template.domain}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <LegendSwatch label="Progressed" className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200" />
          <LegendSwatch label="Next" className="border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200" />
          <LegendSwatch label="Blocked" className="border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200" />
          <LegendSwatch label="Latest" className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200" />
        </div>
      </div>

      <div className="h-[460px] lg:h-[520px]">
        <GraphCanvasShell
          adapter={graphDomainAdapter}
          fitView
          fitViewPadding={0.26}
          containerClassName="h-full border border-neutral-200/80 dark:border-neutral-700/80"
          canvasClassName="bg-white/60 dark:bg-neutral-900/45"
          backgroundVariant={BackgroundVariant.Dots}
          showMiniMap={flowNodes.length > 2}
          miniMapNodeColor={getMiniMapNodeColor}
        />
      </div>
    </div>
  );
}

function JourneyNodeRenderer({ data }: NodeProps<JourneyNodeData>) {
  const style = nodeStyle({
    isStart: data.isStart,
    isProgressed: data.isProgressed,
    isSuggested: data.isSuggested,
    isNext: data.isNext,
    isBlocked: data.isBlocked,
    isLatest: data.isLatest,
  });
  const [line1, line2] = splitLabel(data.label);

  return (
    <div
      className={`w-[184px] rounded-xl border bg-white px-3 py-2 shadow-sm transition-shadow dark:bg-neutral-900 ${style.rect}`}
      style={{ borderWidth: style.strokeWidth }}
    >
      <Handle type="target" position={Position.Left} className={HIDDEN_HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} className={HIDDEN_HANDLE_CLASS} />

      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-medium uppercase tracking-wide ${style.kind}`}>
          {data.kind}
        </span>
        {data.isStart && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200">
            start
          </span>
        )}
      </div>

      <div className={`text-[12px] font-semibold leading-5 ${style.label}`}>{line1}</div>
      {line2 ? (
        <div className={`text-[12px] font-semibold leading-5 ${style.label}`}>{line2}</div>
      ) : null}
    </div>
  );
}

function buildCanvasModel(template: FlowTemplate | null) {
  if (!template) return null;

  const levelByNode = computeNodeLevels(template);
  const rowsByLevel = new Map<number, FlowNode[]>();
  const nodeOrder = new Map(template.nodes.map((node, index) => [node.id, index]));

  for (const node of template.nodes) {
    const level = levelByNode[node.id] ?? 0;
    const bucket = rowsByLevel.get(level) ?? [];
    bucket.push(node);
    rowsByLevel.set(level, bucket);
  }

  for (const bucket of rowsByLevel.values()) {
    bucket.sort((a, b) => (nodeOrder.get(a.id) ?? 0) - (nodeOrder.get(b.id) ?? 0));
  }

  const positioned: PositionedNode[] = [];
  const nodesById: Record<string, PositionedNode> = {};

  const sortedLevels = Array.from(rowsByLevel.keys()).sort((a, b) => a - b);
  for (const level of sortedLevels) {
    const nodes = rowsByLevel.get(level) ?? [];
    nodes.forEach((node, rowIndex) => {
      const x = CANVAS_MARGIN + level * (NODE_WIDTH + NODE_GAP_X);
      const y = CANVAS_MARGIN + rowIndex * (NODE_HEIGHT + NODE_GAP_Y);
      const item: PositionedNode = { node, x, y };
      positioned.push(item);
      nodesById[node.id] = item;
    });
  }

  return {
    nodes: positioned,
    nodesById,
    edges: template.edges,
  };
}

function buildJourneyVisualState(
  candidate?: FlowCandidateTemplate,
  nextStep?: FlowNextStep,
  blockedStep?: FlowBlockedStep,
  suggestedPath?: FlowSuggestedPath,
  latestRun?: FlowRunSummary
): JourneyVisualState {
  const progressed = new Set(candidate?.progressed_node_ids ?? []);
  const suggestedNodes = new Set(suggestedPath?.node_ids ?? []);
  const suggestedEdges = new Set<string>();
  const pathNodes = suggestedPath?.node_ids ?? [];

  if (pathNodes.length > 1) {
    for (let i = 0; i < pathNodes.length - 1; i += 1) {
      suggestedEdges.add(`${pathNodes[i]}->${pathNodes[i + 1]}`);
    }
  }

  return {
    progressed,
    suggestedNodes,
    suggestedEdges,
    nextNodeId: nextStep?.node_id,
    blockedNodeId: blockedStep?.node_id,
    blockedEdgeId: blockedStep?.edge_id,
    latestNodeId: latestRun?.last_node_id,
  };
}

function computeNodeLevels(template: FlowTemplate): Record<string, number> {
  const levelByNode: Record<string, number> = {};
  levelByNode[template.start_node_id] = 0;

  const maxPasses = Math.max(1, template.nodes.length * 2);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const edge of template.edges) {
      const fromLevel = levelByNode[edge.from];
      if (typeof fromLevel !== 'number') continue;
      const nextLevel = fromLevel + 1;
      const existing = levelByNode[edge.to];
      if (typeof existing !== 'number' || existing < nextLevel) {
        levelByNode[edge.to] = nextLevel;
        changed = true;
      }
    }
    if (!changed) break;
  }

  let fallbackLevel = Math.max(0, ...Object.values(levelByNode));
  for (const node of template.nodes) {
    if (typeof levelByNode[node.id] !== 'number') {
      fallbackLevel += 1;
      levelByNode[node.id] = fallbackLevel;
    }
  }

  return levelByNode;
}

function nodeStyle({
  isStart,
  isProgressed,
  isSuggested,
  isNext,
  isBlocked,
  isLatest,
}: {
  isStart: boolean;
  isProgressed: boolean;
  isSuggested: boolean;
  isNext: boolean;
  isBlocked: boolean;
  isLatest: boolean;
}) {
  if (isBlocked) {
    return {
      rect: 'border-rose-400 bg-rose-50 dark:border-rose-500 dark:bg-rose-950/40',
      label: 'text-rose-900 dark:text-rose-100',
      kind: 'text-rose-700 dark:text-rose-300',
      strokeWidth: 2,
    };
  }
  if (isNext) {
    return {
      rect: 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40',
      label: 'text-sky-900 dark:text-sky-100',
      kind: 'text-sky-700 dark:text-sky-300',
      strokeWidth: 2,
    };
  }
  if (isSuggested || isProgressed) {
    return {
      rect: 'border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40',
      label: 'text-emerald-900 dark:text-emerald-100',
      kind: 'text-emerald-700 dark:text-emerald-300',
      strokeWidth: 1.8,
    };
  }
  if (isLatest) {
    return {
      rect: 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/40',
      label: 'text-amber-900 dark:text-amber-100',
      kind: 'text-amber-700 dark:text-amber-300',
      strokeWidth: 1.7,
    };
  }
  if (isStart) {
    return {
      rect: 'border-neutral-500 bg-neutral-100 dark:border-neutral-300 dark:bg-neutral-800',
      label: 'text-neutral-900 dark:text-neutral-100',
      kind: 'text-neutral-600 dark:text-neutral-300',
      strokeWidth: 1.8,
    };
  }
  return {
    rect: 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900',
    label: 'text-neutral-900 dark:text-neutral-100',
    kind: 'text-neutral-500 dark:text-neutral-400',
    strokeWidth: 1.2,
  };
}

function getMiniMapNodeColor(node: Node): string {
  const data = node.data as JourneyNodeData | undefined;
  if (!data) return '#94a3b8';
  if (data.isBlocked) return '#fb7185';
  if (data.isNext) return '#38bdf8';
  if (data.isSuggested || data.isProgressed) return '#34d399';
  if (data.isLatest) return '#f59e0b';
  if (data.isStart) return '#64748b';
  return '#a3a3a3';
}

function splitLabel(label: string): [string, string] {
  const trimmed = label.trim();
  if (trimmed.length <= 24) {
    return [trimmed, ''];
  }
  const words = trimmed.split(/\s+/);
  if (words.length < 2) {
    return [trimmed.slice(0, 24), trimmed.slice(24, 48)];
  }

  let line1 = '';
  let line2 = '';
  for (const word of words) {
    if (!line1 || `${line1} ${word}`.length <= 24) {
      line1 = line1 ? `${line1} ${word}` : word;
    } else {
      line2 = line2 ? `${line2} ${word}` : word;
    }
  }
  return [line1, line2];
}

function LegendSwatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${className}`}>
      {label}
    </span>
  );
}
