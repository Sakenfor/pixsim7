/**
 * PlansGraphPanel - Network view of the plan registry.
 *
 * Data comes from GET /dev/plans/graph — a canonical payload of typed nodes +
 * edges (parent / depends_on / companion / handoff), with server-computed
 * subtree point rollups and reverse-dependency counts.
 *
 * Nodes = plans (color by status, icon by planType, umbrellas larger). The
 * progress bar reflects subtreeProgress, so an umbrella reports where its whole
 * subtree stands even when expanded.
 *
 * Edges = parentId (solid grey) + dependsOn (dashed, colored by target status)
 *         + companions/handoffs (doc links, dotted). Dep + doc edges on by default.
 * Lane clusters = lane:* tag.
 *
 * Umbrellas with children carry a collapse toggle: collapsing hides the whole
 * descendant subtree and reroutes any edges that crossed into it onto the
 * umbrella, so cross-cutting structure survives the fold. A "+N" badge shows
 * how many descendants are tucked away.
 *
 * Click a node → select; right detail pane shows summary + relations and traces
 * the full transitive dependency chain (up + down). Double-click → navigate to
 * the plan in PlansPanel.
 *
 * Mirrors DependencyGraphPanel's reactflow + dagre pattern.
 */

import dagre from '@dagrejs/dagre';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  type Edge,
  type Node,
  type NodeTypes,
  useEdgesState,
  useNodesState,
} from 'reactflow';

import 'reactflow/dist/style.css';

import {
  Badge,
  Button,
  EmptyState,
  StatusPill,
  Switch,
  type StatusTone,
} from '@pixsim7/shared.ui';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { navigateToPlan } from '@features/workspace/lib/openPanel';

import { LatestNextUp } from './plans/detail/LatestNextUp';
import {
  isCanonicalPlanId,
  PLAN_TYPE_ICONS,
  type GraphPoints,
  type PlanGraphEdge,
  type PlanGraphNode,
  type PlanGraphResponse,
} from './plans/detail/types';

const NODE_W = 200;
const NODE_H = 60;
const UMBRELLA_W = 220;
const UMBRELLA_H = 70;
const GROUP_PAD = 16;
const GROUP_LABEL_H = 24;
const DETAIL_PANE_WIDTH = 300;

// ============================================================================
// Status palette
// ============================================================================

interface StatusStyle {
  border: string;
  bg: string;
  text: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  active: { border: '#10b981', bg: 'rgba(16,185,129,0.08)', text: '#047857' },
  done: { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', text: '#1d4ed8' },
  parked: { border: '#9ca3af', bg: 'rgba(156,163,175,0.08)', text: '#4b5563' },
  blocked: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', text: '#b91c1c' },
};

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  done: 'info',
  parked: 'neutral',
  blocked: 'danger',
};

const HIDDEN_STATUSES = new Set(['archived', 'removed']);
const FOCUS_DIM_OPACITY = 0.15;

function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.parked;
}

function statusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? 'neutral';
}

// ============================================================================
// Lane palette (deterministic hash → hue)
// ============================================================================

function laneFromTags(tags: string[]): string | null {
  for (const t of tags) {
    if (t.startsWith('lane:')) return t.slice(5);
  }
  return null;
}

function laneStyle(lane: string): StatusStyle {
  let h = 0;
  for (let i = 0; i < lane.length; i++) h = (h * 31 + lane.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    border: `hsla(${hue}, 60%, 55%, 0.45)`,
    bg: `hsla(${hue}, 60%, 55%, 0.06)`,
    text: `hsl(${hue}, 60%, 40%)`,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ============================================================================
// Layout
// ============================================================================

interface BuildOptions {
  showDepEdges: boolean;
  showDocEdges: boolean;
  collapsedIds: Set<string>;
}

interface PlanGraphResult {
  nodes: Node[];
  edges: Edge[];
  lanes: string[];
  /** plan id → number of descendants in its subtree */
  descendantCount: Map<string, number>;
}

/** Doc-link edge palette — companions vs handoffs read as distinct strokes. */
const COMPANION_STROKE = '#a855f7'; // purple
const HANDOFF_STROKE = '#14b8a6'; // teal

function buildPlanGraph(
  rawNodes: PlanGraphNode[],
  rawEdges: PlanGraphEdge[],
  opts: BuildOptions,
): PlanGraphResult {
  const visibleAll = rawNodes.filter((n) => !HIDDEN_STATUSES.has(n.status));
  const planById = new Map(visibleAll.map((n) => [n.id, n]));
  // Edges restricted to plans still present after status filtering.
  const edgesInScope = rawEdges.filter(
    (e) => planById.has(e.source) && planById.has(e.target),
  );

  // Parent → direct children (from parent edges).
  const childrenByParent = new Map<string, string[]>();
  for (const e of edgesInScope) {
    if (e.kind !== 'parent') continue;
    const arr = childrenByParent.get(e.source);
    if (arr) arr.push(e.target);
    else childrenByParent.set(e.source, [e.target]);
  }

  const collectDescendants = (id: string, acc: string[] = []): string[] => {
    for (const kid of childrenByParent.get(id) ?? []) {
      acc.push(kid);
      collectDescendants(kid, acc);
    }
    return acc;
  };

  // Total descendant count per plan (for the "+N" badge) and the set of nodes
  // hidden because some ancestor is collapsed.
  const descendantCount = new Map<string, number>();
  const hidden = new Set<string>();
  for (const n of visibleAll) {
    const desc = collectDescendants(n.id);
    if (desc.length) descendantCount.set(n.id, desc.length);
  }
  for (const cid of opts.collapsedIds) {
    if (!planById.has(cid)) continue;
    for (const d of collectDescendants(cid)) hidden.add(d);
  }

  const visible = visibleAll.filter((n) => !hidden.has(n.id));

  // Nearest non-hidden ancestor a hidden node folds into (its collapsed umbrella).
  const anchorOf = (id: string): string | null => {
    if (planById.has(id) && !hidden.has(id)) return id;
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && hidden.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = planById.get(cur)?.parentId ?? undefined;
    }
    return cur && planById.has(cur) && !hidden.has(cur) ? cur : null;
  };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 90, marginx: 30, marginy: 30 });

  const lanesUsed = new Set<string>();
  for (const n of visible) {
    const lane = laneFromTags(n.tags);
    if (lane) lanesUsed.add(lane);
  }
  for (const lane of lanesUsed) g.setNode(`lane-${lane}`, {});

  const planNodes: Node[] = [];
  for (const n of visible) {
    const isUmbrella = n.planType === 'umbrella';
    const w = isUmbrella ? UMBRELLA_W : NODE_W;
    const h = isUmbrella ? UMBRELLA_H : NODE_H;
    const nodeId = `plan-${n.id}`;
    g.setNode(nodeId, { width: w, height: h });

    const lane = laneFromTags(n.tags);
    if (lane) g.setParent(nodeId, `lane-${lane}`);

    planNodes.push({
      id: nodeId,
      type: 'planNode',
      position: { x: 0, y: 0 },
      // subtreeProgress: an umbrella shows its rolled-up work; a leaf shows its own.
      data: { plan: n, isUmbrella, progress: n.subtreeProgress },
    });
  }

  const edges: Edge[] = [];
  const dagreEdgeSet = new Set<string>();
  const seenEdge = new Set<string>();
  const addDagreEdge = (from: string, to: string) => {
    const k = `${from}->${to}`;
    if (dagreEdgeSet.has(k)) return;
    dagreEdgeSet.add(k);
    g.setEdge(from, to);
  };

  for (const e of edgesInScope) {
    if (e.kind === 'depends_on' && !opts.showDepEdges) continue;
    if ((e.kind === 'companion' || e.kind === 'handoff') && !opts.showDocEdges) continue;

    const from = anchorOf(e.source);
    const to = anchorOf(e.target);
    if (!from || !to || from === to) continue;

    const key = `${e.kind}:${from}->${to}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);

    const fromNode = `plan-${from}`;
    const toNode = `plan-${to}`;

    if (e.kind === 'parent') {
      edges.push({
        id: key,
        source: fromNode,
        target: toNode,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', opacity: 0.55, strokeWidth: 1.5 },
      });
      addDagreEdge(fromNode, toNode);
    } else if (e.kind === 'depends_on') {
      const target = planById.get(to);
      const style = statusStyle(target?.status ?? 'parked');
      edges.push({
        id: key,
        source: fromNode,
        target: toNode,
        type: 'smoothstep',
        animated: target?.status === 'active',
        style: { stroke: style.border, opacity: 0.7, strokeWidth: 1.5, strokeDasharray: '5 4' },
      });
      addDagreEdge(fromNode, toNode);
    } else {
      // companion / handoff — cross-cutting; kept out of the dagre rank solve.
      const stroke = e.kind === 'companion' ? COMPANION_STROKE : HANDOFF_STROKE;
      edges.push({
        id: key,
        source: fromNode,
        target: toNode,
        type: 'smoothstep',
        style: { stroke, opacity: 0.6, strokeWidth: 1.25, strokeDasharray: '2 3' },
      });
    }
  }

  dagre.layout(g);

  const positioned = planNodes.map((n) => {
    const p = g.node(n.id);
    const isUmbrella = (n.data as { isUmbrella: boolean }).isUmbrella;
    const w = isUmbrella ? UMBRELLA_W : NODE_W;
    const h = isUmbrella ? UMBRELLA_H : NODE_H;
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } };
  });

  const groupNodes: Node[] = [];
  for (const lane of lanesUsed) {
    const childIds = visible
      .filter((n) => laneFromTags(n.tags) === lane)
      .map((n) => `plan-${n.id}`);
    const positions = childIds.map((id) => g.node(id)).filter(Boolean);
    if (positions.length === 0) continue;

    const minX = Math.min(...positions.map((p) => p.x - NODE_W / 2)) - GROUP_PAD;
    const minY =
      Math.min(...positions.map((p) => p.y - NODE_H / 2)) - GROUP_PAD - GROUP_LABEL_H;
    const maxX = Math.max(...positions.map((p) => p.x + NODE_W / 2)) + GROUP_PAD;
    const maxY = Math.max(...positions.map((p) => p.y + NODE_H / 2)) + GROUP_PAD;

    groupNodes.push({
      id: `lane-${lane}`,
      type: 'laneGroup',
      position: { x: minX, y: minY },
      data: { label: `lane:${lane} (${childIds.length})`, lane },
      style: { width: maxX - minX, height: maxY - minY },
      selectable: false,
      draggable: false,
      zIndex: -1,
    });
  }

  return {
    nodes: [...groupNodes, ...positioned],
    edges,
    lanes: [...lanesUsed].sort(),
    descendantCount,
  };
}

// ============================================================================
// Node renderers
// ============================================================================

interface PlanNodeData {
  plan: PlanGraphNode;
  isUmbrella: boolean;
  /** descendants in the subtree (drives collapse affordance + badge) */
  descendants?: number;
  collapsed?: boolean;
  /** points done/total — umbrellas roll up their subtree (server-computed) */
  progress?: GraphPoints;
  onToggleCollapse?: (planId: string) => void;
}

function PlanNode({ data, selected }: { data: PlanNodeData; selected?: boolean }) {
  const { plan, isUmbrella, descendants = 0, collapsed = false, progress, onToggleCollapse } = data;
  const sStyle = statusStyle(plan.status);
  const iconName = PLAN_TYPE_ICONS[plan.planType] ?? 'fileText';
  const canCollapse = descendants > 0 && !!onToggleCollapse;
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-md cursor-pointer transition-shadow relative"
      style={{
        width: isUmbrella ? UMBRELLA_W : NODE_W,
        height: isUmbrella ? UMBRELLA_H : NODE_H,
        border: `${isUmbrella ? '2.5px' : '1.5px'} ${collapsed ? 'double' : 'solid'} ${sStyle.border}`,
        backgroundColor: sStyle.bg,
        padding: '6px 10px',
        boxSizing: 'border-box',
        boxShadow: selected ? `0 0 0 3px ${sStyle.border}55` : '0 1px 2px rgba(0,0,0,0.05)',
      }}
      title={`${plan.id}\n${plan.summary}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: sStyle.border }} />
      <Handle type="source" position={Position.Bottom} style={{ background: sStyle.border }} />
      <div className="flex items-center gap-1.5 mb-0.5">
        {canCollapse && (
          <button
            type="button"
            className="flex-none rounded hover:bg-black/10 dark:hover:bg-white/10 -ml-1"
            style={{ color: sStyle.text, lineHeight: 0, padding: 1 }}
            title={collapsed ? `Expand ${descendants} descendants` : 'Collapse subtree'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(plan.id);
            }}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={isUmbrella ? 14 : 12} />
          </button>
        )}
        <Icon name={iconName} size={isUmbrella ? 14 : 12} />
        <div
          className="font-semibold truncate"
          style={{ fontSize: isUmbrella ? 12 : 11, color: sStyle.text, flex: 1 }}
        >
          {truncate(plan.title, 40)}
        </div>
        {collapsed && descendants > 0 && (
          <span
            className="flex-none rounded-full px-1.5 text-[9px] font-bold"
            style={{ backgroundColor: sStyle.border, color: '#fff' }}
            title={`${descendants} hidden`}
          >
            +{descendants}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-[9px] text-neutral-500 dark:text-neutral-400">
        <span className="font-mono">{plan.id}</span>
        {total > 0 && <span className="ml-auto tabular-nums">{done}/{total}pt</span>}
        <span className={`uppercase tracking-wide ${total > 0 ? 'ml-1' : 'ml-auto'}`}>
          {plan.stage}
        </span>
      </div>
      {total > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b overflow-hidden bg-neutral-200 dark:bg-neutral-700"
          title={`${done}/${total} points done (${pct}%)`}
        >
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: sStyle.border }} />
        </div>
      )}
    </div>
  );
}

interface LaneGroupData {
  label: string;
  lane: string;
}

function LaneGroup({ data }: { data: LaneGroupData }) {
  const lStyle = laneStyle(data.lane);
  return (
    <div
      className="w-full h-full rounded-xl pointer-events-none relative"
      style={{
        backgroundColor: lStyle.bg,
        border: `1.5px dashed ${lStyle.border}`,
      }}
    >
      <div
        className="absolute top-0 left-3 px-2 py-0.5 text-[10px] font-semibold rounded-b font-mono"
        style={{ color: lStyle.text, backgroundColor: lStyle.bg }}
      >
        {data.label}
      </div>
    </div>
  );
}

function EdgeLegendItem({
  color,
  dash,
  label,
}: {
  color: string;
  dash: 'solid' | 'dashed' | 'dotted';
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-4"
        style={{ borderTop: `2px ${dash} ${color}` }}
        aria-hidden
      />
      {label}
    </span>
  );
}

// ============================================================================
// Detail pane
// ============================================================================

interface PlanDetailProps {
  plan: PlanGraphNode;
  nodesById: Map<string, PlanGraphNode>;
  edges: PlanGraphEdge[];
  onSelect: (planId: string) => void;
}

function PlanDetail({ plan, nodesById, edges, onSelect }: PlanDetailProps) {
  const lane = laneFromTags(plan.tags);
  const otherTags = plan.tags.filter((t) => !t.startsWith('lane:'));
  const parent = plan.parentId ? nodesById.get(plan.parentId) : undefined;
  const iconName = PLAN_TYPE_ICONS[plan.planType] ?? 'fileText';

  // Derive relation lists from the canonical edge set.
  const rel = useMemo(() => {
    const lookup = (ids: string[]) =>
      ids.map((id) => nodesById.get(id)).filter((n): n is PlanGraphNode => !!n);
    const children: string[] = [];
    const dependsOn: string[] = [];
    const dependedOnBy: string[] = [];
    const companions: string[] = [];
    const handoffs: string[] = [];
    for (const e of edges) {
      if (e.kind === 'parent' && e.source === plan.id) children.push(e.target);
      if (e.kind === 'depends_on' && e.source === plan.id) dependsOn.push(e.target);
      if (e.kind === 'depends_on' && e.target === plan.id) dependedOnBy.push(e.source);
      if (e.kind === 'companion' && e.source === plan.id) companions.push(e.target);
      if (e.kind === 'handoff' && e.source === plan.id) handoffs.push(e.target);
    }
    return {
      children: lookup(children),
      dependsOn: lookup(dependsOn),
      dependedOnBy: lookup(dependedOnBy),
      companions: lookup(companions),
      handoffs: lookup(handoffs),
    };
  }, [edges, nodesById, plan.id]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="space-y-1.5">
        <div className="flex items-start gap-1.5">
          <Icon name={iconName} size={14} />
          <div className="font-semibold text-sm leading-tight flex-1">{plan.title}</div>
        </div>
        <div className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 break-all">
          {plan.id}
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={statusTone(plan.status)} dot>
            {plan.status}
          </StatusPill>
          <Badge color="gray">{plan.stage}</Badge>
          <Badge color="blue">{plan.planType}</Badge>
          {plan.priority && plan.priority !== 'normal' && (
            <Badge color={plan.priority === 'high' ? 'orange' : 'gray'}>{plan.priority}</Badge>
          )}
        </div>
      </div>

      {plan.subtreeProgress.total > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold uppercase tracking-wide">Subtree</span>
          <span className="tabular-nums">
            {plan.subtreeProgress.done}/{plan.subtreeProgress.total} pts
          </span>
          {plan.descendantCount > 0 && <span>· {plan.descendantCount} descendants</span>}
        </div>
      )}

      {plan.summary && (
        <div className="text-neutral-700 dark:text-neutral-300 leading-relaxed">{plan.summary}</div>
      )}

      <LatestNextUp planId={plan.id} compact />

      {(lane || otherTags.length > 0) && (
        <div>
          <div className="font-semibold text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {lane && <Badge color="purple">lane:{lane}</Badge>}
            {otherTags.map((t) => (
              <Badge key={t} color="gray">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {parent && <RelationList label="Parent" plans={[parent]} onSelect={onSelect} />}
      {rel.children.length > 0 && (
        <RelationList label={`Children (${rel.children.length})`} plans={rel.children} onSelect={onSelect} />
      )}
      {rel.dependsOn.length > 0 && (
        <RelationList
          label={`Depends on (${rel.dependsOn.length})`}
          plans={rel.dependsOn}
          onSelect={onSelect}
        />
      )}
      {rel.dependedOnBy.length > 0 && (
        <RelationList
          label={`Depended on by (${rel.dependedOnBy.length})`}
          plans={rel.dependedOnBy}
          onSelect={onSelect}
        />
      )}
      {rel.companions.length > 0 && (
        <RelationList
          label={`Companions (${rel.companions.length})`}
          plans={rel.companions}
          onSelect={onSelect}
        />
      )}
      {rel.handoffs.length > 0 && (
        <RelationList
          label={`Handoffs (${rel.handoffs.length})`}
          plans={rel.handoffs}
          onSelect={onSelect}
        />
      )}
      {plan.externalDocCount > 0 && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 italic">
          + {plan.externalDocCount} linked doc{plan.externalDocCount === 1 ? '' : 's'} (not plans)
        </div>
      )}

      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <Button size="sm" onClick={() => navigateToPlan(plan.id)} className="w-full">
          Open in Plans panel
        </Button>
      </div>
    </div>
  );
}

function RelationList({
  label,
  plans,
  onSelect,
}: {
  label: string;
  plans: PlanGraphNode[];
  onSelect: (planId: string) => void;
}) {
  return (
    <div>
      <div className="font-semibold text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
        {label}
      </div>
      <div className="space-y-0.5">
        {plans.map((p) => {
          const sStyle = statusStyle(p.status);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full text-left px-1.5 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-none"
                style={{ backgroundColor: sStyle.border }}
              />
              <span className="font-mono text-[10px] truncate">{p.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main
// ============================================================================

export function PlansGraphPanel() {
  const [allNodes, setAllNodes] = useState<PlanGraphNode[]>([]);
  const [allEdges, setAllEdges] = useState<PlanGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [showDepEdges, setShowDepEdges] = useState(true);
  const [showDocEdges, setShowDocEdges] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleCollapse = useCallback((planId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    pixsimClient
      .get<PlanGraphResponse>('/dev/plans/graph')
      .then((res) => {
        const nodes = res.nodes.filter((n) => isCanonicalPlanId(n.id));
        const ids = new Set(nodes.map((n) => n.id));
        setAllNodes(nodes);
        setAllEdges(res.edges.filter((e) => ids.has(e.source) && ids.has(e.target)));
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plan graph'))
      .finally(() => setLoading(false));
  }, []);

  const nodesById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  const filteredNodes = useMemo(() => {
    if (statusFilter.size === 0) return allNodes;
    return allNodes.filter((n) => !statusFilter.has(n.status));
  }, [allNodes, statusFilter]);

  const { graphNodes, graphEdges, lanes, descendantCount } = useMemo(() => {
    const result = buildPlanGraph(filteredNodes, allEdges, { showDepEdges, showDocEdges, collapsedIds });
    return {
      graphNodes: result.nodes,
      graphEdges: result.edges,
      lanes: result.lanes,
      descendantCount: result.descendantCount,
    };
  }, [filteredNodes, allEdges, showDepEdges, showDocEdges, collapsedIds]);

  // Plans that have a subtree to fold (drives the collapse-all control).
  const umbrellaIds = useMemo(() => [...descendantCount.keys()], [descendantCount]);

  // Forward/back dependency adjacency for the transitive focus trace.
  const depAdjacency = useMemo(() => {
    const forward = new Map<string, string[]>();
    const back = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    const childrenOf = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, k: string, v: string) => {
      const arr = m.get(k);
      if (arr) arr.push(v);
      else m.set(k, [v]);
    };
    for (const e of allEdges) {
      if (e.kind === 'depends_on') {
        push(forward, e.source, e.target);
        push(back, e.target, e.source);
      } else if (e.kind === 'parent') {
        parentOf.set(e.target, e.source);
        push(childrenOf, e.source, e.target);
      }
    }
    return { forward, back, parentOf, childrenOf };
  }, [allEdges]);

  // Focus neighborhood: immediate hierarchy plus the *transitive* dependency
  // chain in both directions (everything it depends on, recursively, and
  // everything that recursively depends on it).
  const neighborIds = useMemo<Set<string> | null>(() => {
    if (!selectedId) return null;
    const ids = new Set<string>([selectedId]);
    const { forward, back, parentOf, childrenOf } = depAdjacency;

    const parent = parentOf.get(selectedId);
    if (parent) ids.add(parent);
    for (const c of childrenOf.get(selectedId) ?? []) ids.add(c);

    const walk = (adj: Map<string, string[]>) => {
      const stack = [...(adj.get(selectedId) ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (ids.has(cur)) continue;
        ids.add(cur);
        for (const next of adj.get(cur) ?? []) if (!ids.has(next)) stack.push(next);
      }
    };
    walk(forward);
    walk(back);
    return ids;
  }, [selectedId, depAdjacency]);

  // Apply focus dim + selection mark to nodes/edges (style-only; doesn't relayout).
  const displayNodes = useMemo(() => {
    return graphNodes.map((n) => {
      if (n.type !== 'planNode') return n;
      const data = n.data as PlanNodeData;
      const planId = data.plan.id;
      const isSelected = planId === selectedId;
      const dimmed = neighborIds && !neighborIds.has(planId);
      return {
        ...n,
        selected: isSelected,
        data: {
          ...data,
          descendants: descendantCount.get(planId) ?? 0,
          collapsed: collapsedIds.has(planId),
          onToggleCollapse: toggleCollapse,
        },
        style: { ...(n.style ?? {}), opacity: dimmed ? FOCUS_DIM_OPACITY : 1 },
      };
    });
  }, [graphNodes, neighborIds, selectedId, descendantCount, collapsedIds, toggleCollapse]);

  const displayEdges = useMemo(() => {
    if (!neighborIds) return graphEdges;
    return graphEdges.map((e) => {
      const fromPlanId = e.source.replace(/^plan-/, '');
      const toPlanId = e.target.replace(/^plan-/, '');
      const focused = neighborIds.has(fromPlanId) && neighborIds.has(toPlanId);
      const baseOpacity = (e.style?.opacity as number | undefined) ?? 0.7;
      return {
        ...e,
        style: { ...(e.style ?? {}), opacity: focused ? baseOpacity : 0.05 },
      };
    });
  }, [graphEdges, neighborIds]);

  const [nodes, , onNodesChange] = useNodesState(displayNodes);
  const [edges, , onEdgesChange] = useEdgesState(displayEdges);

  useEffect(() => {
    onNodesChange(displayNodes.map((n) => ({ type: 'reset' as const, item: n })));
    onEdgesChange(displayEdges.map((e) => ({ type: 'reset' as const, item: e })));
  }, [displayNodes, displayEdges, onNodesChange, onEdgesChange]);

  const nodeTypes = useMemo<NodeTypes>(() => ({ planNode: PlanNode, laneGroup: LaneGroup }), []);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type !== 'planNode') return;
    setSelectedId((node.data as PlanNodeData).plan.id);
  }, []);

  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type !== 'planNode') return;
    navigateToPlan((node.data as PlanNodeData).plan.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const toggleStatus = useCallback((status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500">
        Loading plan graph…
      </div>
    );
  }
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  const statusCounts = allNodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1;
    return acc;
  }, {});
  const selectedPlan = selectedId ? nodesById.get(selectedId) ?? null : null;

  return (
    <div className="w-full h-full bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      <div className="flex-none border-b border-neutral-200 dark:border-neutral-700 px-3 py-2 flex flex-wrap gap-2 items-center text-xs">
        <span className="font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Status
        </span>
        {(['active', 'parked', 'done', 'blocked'] as const).map((s) => {
          if (!statusCounts[s]) return null;
          const hidden = statusFilter.has(s);
          const sStyle = statusStyle(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                hidden
                  ? 'border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 line-through'
                  : ''
              }`}
              style={
                hidden
                  ? undefined
                  : { borderColor: sStyle.border, color: sStyle.text, backgroundColor: sStyle.bg }
              }
            >
              {s} ({statusCounts[s]})
            </button>
          );
        })}
        <div className="h-4 border-l border-neutral-300 dark:border-neutral-600" />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch checked={showDepEdges} onCheckedChange={setShowDepEdges} size="sm" />
          <span className="text-neutral-600 dark:text-neutral-400">Dependencies</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch checked={showDocEdges} onCheckedChange={setShowDocEdges} size="sm" />
          <span className="text-neutral-600 dark:text-neutral-400">Doc links</span>
        </label>
        <div className="h-4 border-l border-neutral-300 dark:border-neutral-600" />
        {umbrellaIds.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setCollapsedIds((prev) =>
                prev.size >= umbrellaIds.length ? new Set() : new Set(umbrellaIds),
              )
            }
          >
            {collapsedIds.size >= umbrellaIds.length ? 'Expand all' : 'Collapse umbrellas'}
          </Button>
        )}
        {lanes.length > 0 && (
          <>
            <div className="h-4 border-l border-neutral-300 dark:border-neutral-600" />
            <span className="font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              {lanes.length} {lanes.length === 1 ? 'lane' : 'lanes'}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          <EdgeLegendItem color="#94a3b8" dash="solid" label="parent" />
          {showDepEdges && <EdgeLegendItem color="#10b981" dash="dashed" label="depends on" />}
          {showDocEdges && (
            <>
              <EdgeLegendItem color={COMPANION_STROKE} dash="dotted" label="companion" />
              <EdgeLegendItem color={HANDOFF_STROKE} dash="dotted" label="handoff" />
            </>
          )}
          <span className="pl-1.5 border-l border-neutral-300 dark:border-neutral-600">
            {filteredNodes.length}/{allNodes.length} plans · {graphEdges.length} edges
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'laneGroup') return 'transparent';
                if (node.type === 'planNode') {
                  return statusStyle((node.data as PlanNodeData).plan.status).border;
                }
                return '#6b7280';
              }}
            />
          </ReactFlow>
        </div>

        <div
          className="flex-none border-l border-neutral-200 dark:border-neutral-700 overflow-y-auto bg-neutral-50 dark:bg-neutral-900"
          style={{ width: DETAIL_PANE_WIDTH }}
        >
          {selectedPlan ? (
            <PlanDetail
              plan={selectedPlan}
              nodesById={nodesById}
              edges={allEdges}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="p-3">
              <EmptyState
                message="Click a plan to see details"
                description="Single-click traces its full dependency chain (up + down) and dims the rest. Double-click opens it in the Plans panel."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
