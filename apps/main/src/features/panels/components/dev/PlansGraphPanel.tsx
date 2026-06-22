/**
 * PlansGraphPanel - Network view of the plan registry.
 *
 * Nodes = plans (color by status, icon by planType, umbrellas larger).
 * Edges = parentId (solid grey) + dependsOn (dashed, colored by target status)
 *         + companions/handoffs (doc links, dotted). Dep + doc edges on by default.
 * Lane clusters = lane:* tag.
 *
 * Umbrellas with children carry a collapse toggle: collapsing hides the whole
 * descendant subtree and reroutes any edges that crossed into it onto the
 * umbrella, so cross-cutting structure survives the fold. A "+N" badge shows
 * how many descendants are tucked away.
 *
 * Click a node → select; right detail pane shows summary + relations.
 * Double-click → navigate to the plan in PlansPanel.
 * Selected node + neighbors stay full-opacity; others dim (focus mode).
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
  type PlanSummary,
  type PlansIndexResponse,
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
  /** plan id → number of descendants hidden underneath it while collapsed */
  descendantCount: Map<string, number>;
}

/** Doc-link edge palette — companions vs handoffs read as distinct strokes. */
const COMPANION_STROKE = '#a855f7'; // purple
const HANDOFF_STROKE = '#14b8a6'; // teal

function buildPlanGraph(plans: PlanSummary[], opts: BuildOptions): PlanGraphResult {
  const visibleAll = plans.filter((p) => !HIDDEN_STATUSES.has(p.status));
  const planById = new Map(visibleAll.map((p) => [p.id, p]));

  // Parent → direct children, restricted to plans actually in the graph.
  const childrenByParent = new Map<string, string[]>();
  for (const p of visibleAll) {
    if (p.parentId && planById.has(p.parentId)) {
      const arr = childrenByParent.get(p.parentId);
      if (arr) arr.push(p.id);
      else childrenByParent.set(p.parentId, [p.id]);
    }
  }

  const collectDescendants = (id: string, acc: string[] = []): string[] => {
    for (const kid of childrenByParent.get(id) ?? []) {
      acc.push(kid);
      collectDescendants(kid, acc);
    }
    return acc;
  };

  // Total descendant count per plan (for the "+N" collapse badge) and the set of
  // nodes hidden because some ancestor is collapsed.
  const descendantCount = new Map<string, number>();
  const hidden = new Set<string>();
  for (const p of visibleAll) {
    const desc = collectDescendants(p.id);
    if (desc.length) descendantCount.set(p.id, desc.length);
  }
  for (const cid of opts.collapsedIds) {
    if (!planById.has(cid)) continue;
    for (const d of collectDescendants(cid)) hidden.add(d);
  }

  const visible = visibleAll.filter((p) => !hidden.has(p.id));

  // Nearest non-hidden ancestor — edges crossing into a collapsed subtree
  // reroute here so cross-cutting relationships stay visible on the umbrella.
  const visibleAnchor = (id: string): string | null => {
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && hidden.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = planById.get(cur)?.parentId ?? undefined;
    }
    return cur && planById.has(cur) ? cur : null;
  };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 90, marginx: 30, marginy: 30 });

  const lanesUsed = new Set<string>();
  for (const p of visible) {
    const lane = laneFromTags(p.tags);
    if (lane) lanesUsed.add(lane);
  }
  for (const lane of lanesUsed) g.setNode(`lane-${lane}`, {});

  const planNodes: Node[] = [];
  for (const p of visible) {
    const isUmbrella = p.planType === 'umbrella';
    const w = isUmbrella ? UMBRELLA_W : NODE_W;
    const h = isUmbrella ? UMBRELLA_H : NODE_H;
    const nodeId = `plan-${p.id}`;
    g.setNode(nodeId, { width: w, height: h });

    const lane = laneFromTags(p.tags);
    if (lane) g.setParent(nodeId, `lane-${lane}`);

    planNodes.push({
      id: nodeId,
      type: 'planNode',
      position: { x: 0, y: 0 },
      data: { plan: p, isUmbrella },
    });
  }

  const edges: Edge[] = [];
  const dagreEdgeSet = new Set<string>();
  const edgeIdSet = new Set<string>();
  const addDagreEdge = (from: string, to: string) => {
    const k = `${from}->${to}`;
    if (dagreEdgeSet.has(k)) return;
    dagreEdgeSet.add(k);
    g.setEdge(from, to);
  };

  // Resolve a raw plan id to the visible node id it should connect to (itself,
  // or its collapsed ancestor). Returns null when the target isn't a plan node.
  const anchorNodeId = (rawId: string): string | null => {
    if (planById.has(rawId) && !hidden.has(rawId)) return `plan-${rawId}`;
    const anchor = visibleAnchor(rawId);
    return anchor ? `plan-${anchor}` : null;
  };

  for (const p of visible) {
    const fromId = `plan-${p.id}`;

    if (p.parentId) {
      const toId = anchorNodeId(p.parentId);
      if (toId && toId !== fromId) {
        edges.push({
          id: `parent-${p.id}`,
          source: toId,
          target: fromId,
          type: 'smoothstep',
          style: { stroke: '#94a3b8', opacity: 0.55, strokeWidth: 1.5 },
        });
        addDagreEdge(toId, fromId);
      }
    }

    if (opts.showDepEdges) {
      for (const dep of p.dependsOn ?? []) {
        const toId = anchorNodeId(dep);
        if (!toId || toId === fromId) continue;
        const id = `dep-${p.id}-${dep}`;
        if (edgeIdSet.has(id)) continue;
        edgeIdSet.add(id);
        const targetPlan = planById.get(dep) ?? planById.get(toId.replace(/^plan-/, ''));
        const style = statusStyle(targetPlan?.status ?? 'parked');
        edges.push({
          id,
          source: fromId,
          target: toId,
          type: 'smoothstep',
          animated: targetPlan?.status === 'active',
          style: {
            stroke: style.border,
            opacity: 0.7,
            strokeWidth: 1.5,
            strokeDasharray: '5 4',
          },
        });
        addDagreEdge(fromId, toId);
      }
    }

    if (opts.showDocEdges) {
      const docLinks: { ids: string[]; kind: string; stroke: string }[] = [
        { ids: p.companions ?? [], kind: 'companion', stroke: COMPANION_STROKE },
        { ids: p.handoffs ?? [], kind: 'handoff', stroke: HANDOFF_STROKE },
      ];
      for (const { ids, kind, stroke } of docLinks) {
        for (const ref of ids) {
          const toId = anchorNodeId(ref);
          if (!toId || toId === fromId) continue;
          const id = `${kind}-${p.id}-${ref}`;
          if (edgeIdSet.has(id)) continue;
          edgeIdSet.add(id);
          edges.push({
            id,
            source: fromId,
            target: toId,
            type: 'smoothstep',
            style: {
              stroke,
              opacity: 0.6,
              strokeWidth: 1.25,
              strokeDasharray: '2 3',
            },
          });
          // Don't feed doc links to dagre — they're cross-cutting and would
          // distort the parent/dep rank layout.
        }
      }
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
      .filter((p) => laneFromTags(p.tags) === lane)
      .map((p) => `plan-${p.id}`);
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
  plan: PlanSummary;
  isUmbrella: boolean;
  /** descendants in the subtree (drives collapse affordance + badge) */
  descendants?: number;
  collapsed?: boolean;
  onToggleCollapse?: (planId: string) => void;
}

function PlanNode({ data, selected }: { data: PlanNodeData; selected?: boolean }) {
  const { plan, isUmbrella, descendants = 0, collapsed = false, onToggleCollapse } = data;
  const sStyle = statusStyle(plan.status);
  const iconName = PLAN_TYPE_ICONS[plan.planType] ?? 'fileText';
  const canCollapse = descendants > 0 && !!onToggleCollapse;

  return (
    <div
      className="rounded-md cursor-pointer transition-shadow"
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
        <span className="ml-auto uppercase tracking-wide">{plan.stage}</span>
      </div>
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
  plan: PlanSummary;
  allPlans: PlanSummary[];
  onSelect: (planId: string) => void;
}

function PlanDetail({ plan, allPlans, onSelect }: PlanDetailProps) {
  const planById = useMemo(() => new Map(allPlans.map((p) => [p.id, p])), [allPlans]);
  const lane = laneFromTags(plan.tags);
  const otherTags = plan.tags.filter((t) => !t.startsWith('lane:'));
  const parent = plan.parentId ? planById.get(plan.parentId) : undefined;
  const children = useMemo(
    () => allPlans.filter((p) => p.parentId === plan.id),
    [allPlans, plan.id],
  );
  const reverseDeps = useMemo(
    () => allPlans.filter((p) => (p.dependsOn ?? []).includes(plan.id)),
    [allPlans, plan.id],
  );
  const iconName = PLAN_TYPE_ICONS[plan.planType] ?? 'fileText';

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
            <Badge color={plan.priority === 'high' ? 'orange' : 'gray'}>
              {plan.priority}
            </Badge>
          )}
        </div>
      </div>

      {plan.summary && (
        <div className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {plan.summary}
        </div>
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

      {parent && (
        <RelationList
          label="Parent"
          plans={[parent]}
          onSelect={onSelect}
        />
      )}
      {children.length > 0 && (
        <RelationList label={`Children (${children.length})`} plans={children} onSelect={onSelect} />
      )}
      {(plan.dependsOn ?? []).length > 0 && (
        <RelationList
          label={`Depends on (${plan.dependsOn.length})`}
          plans={plan.dependsOn.map((id) => planById.get(id)).filter((p): p is PlanSummary => !!p)}
          onSelect={onSelect}
        />
      )}
      {reverseDeps.length > 0 && (
        <RelationList
          label={`Depended on by (${reverseDeps.length})`}
          plans={reverseDeps}
          onSelect={onSelect}
        />
      )}
      {(() => {
        const companionPlans = (plan.companions ?? [])
          .map((id) => planById.get(id))
          .filter((p): p is PlanSummary => !!p);
        return companionPlans.length > 0 ? (
          <RelationList
            label={`Companions (${companionPlans.length})`}
            plans={companionPlans}
            onSelect={onSelect}
          />
        ) : null;
      })()}
      {(() => {
        const handoffPlans = (plan.handoffs ?? [])
          .map((id) => planById.get(id))
          .filter((p): p is PlanSummary => !!p);
        return handoffPlans.length > 0 ? (
          <RelationList
            label={`Handoffs (${handoffPlans.length})`}
            plans={handoffPlans}
            onSelect={onSelect}
          />
        ) : null;
      })()}

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
  plans: PlanSummary[];
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
  const [plans, setPlans] = useState<PlanSummary[]>([]);
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
      .get<PlansIndexResponse>('/dev/plans?compact=true&limit=500')
      .then((res) => {
        setPlans(res.plans.filter((p) => isCanonicalPlanId(p.id)));
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter.size === 0) return plans;
    return plans.filter((p) => !statusFilter.has(p.status));
  }, [plans, statusFilter]);

  const { graphNodes, graphEdges, lanes, descendantCount } = useMemo(() => {
    const result = buildPlanGraph(filtered, { showDepEdges, showDocEdges, collapsedIds });
    return {
      graphNodes: result.nodes,
      graphEdges: result.edges,
      lanes: result.lanes,
      descendantCount: result.descendantCount,
    };
  }, [filtered, showDepEdges, showDocEdges, collapsedIds]);

  // Plans that have a subtree to fold (drives the collapse-all control).
  const umbrellaIds = useMemo(() => [...descendantCount.keys()], [descendantCount]);

  // Compute focus neighborhood for the selected plan.
  const neighborIds = useMemo<Set<string> | null>(() => {
    if (!selectedId) return null;
    const ids = new Set<string>([selectedId]);
    const sel = plans.find((p) => p.id === selectedId);
    if (!sel) return ids;
    if (sel.parentId) ids.add(sel.parentId);
    for (const dep of sel.dependsOn ?? []) ids.add(dep);
    for (const p of plans) {
      if (p.parentId === selectedId) ids.add(p.id);
      if ((p.dependsOn ?? []).includes(selectedId)) ids.add(p.id);
    }
    return ids;
  }, [selectedId, plans]);

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

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ planNode: PlanNode, laneGroup: LaneGroup }),
    [],
  );

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
        Loading plans…
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

  const statusCounts = plans.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const selectedPlan = selectedId ? plans.find((p) => p.id === selectedId) : null;

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
            {filtered.length}/{plans.length} plans · {graphEdges.length} edges
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
            <PlanDetail plan={selectedPlan} allPlans={plans} onSelect={setSelectedId} />
          ) : (
            <div className="p-3">
              <EmptyState
                message="Click a plan to see details"
                description="Single-click selects (and dims non-neighbors). Double-click opens it in the Plans panel."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
