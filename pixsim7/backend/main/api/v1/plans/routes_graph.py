"""Plan graph route — canonical nodes + typed edges for the plan-graph view.

Returns one purpose-built payload so the graph UI (and any future
impact / what-references-X feature) shares a single source of truth for plan
topology. The server resolves cross-references to in-graph plans, rolls up
subtree progress, and computes reverse-dependency counts — work the client
would otherwise duplicate per render.
"""
from typing import Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.shared.schemas.api_base import ApiModel
from pixsim7.backend.main.api.v1.plans import helpers as _h
from pixsim7.backend.main.services.docs.plan_write import HIDDEN_STATUSES

router = APIRouter()


class GraphPoints(ApiModel):
    done: int = 0
    total: int = 0


class PlanGraphNode(ApiModel):
    id: str
    title: str
    status: str
    stage: str
    plan_type: str = "feature"
    priority: str = "normal"
    summary: str = ""
    parent_id: Optional[str] = None
    tags: List[str] = []
    # Own points (this plan's checkpoints only).
    progress: GraphPoints
    # Rolled up across the whole subtree, inclusive of this node — so an
    # umbrella reports where its work stands even when expanded.
    subtree_progress: GraphPoints
    descendant_count: int = 0
    depends_on_count: int = 0
    depended_on_by_count: int = 0
    # companion/handoff refs that point at docs which are NOT plans in the graph.
    external_doc_count: int = 0


class PlanGraphEdge(ApiModel):
    source: str
    target: str
    kind: str  # parent | depends_on | companion | handoff


class PlanGraphResponse(ApiModel):
    nodes: List[PlanGraphNode]
    edges: List[PlanGraphEdge]


def _own_points(checkpoints) -> GraphPoints:
    summary = _h._compute_open_summary(checkpoints or [])
    if summary is None:
        return GraphPoints(done=0, total=0)
    total = summary.total_points
    return GraphPoints(done=max(0, total - summary.open_points), total=total)


@router.get("/graph", response_model=PlanGraphResponse)
async def get_plan_graph(
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
    include_hidden: bool = Query(
        False, description="Include archived/removed plans (hidden by default)."
    ),
):
    """Canonical plan-topology graph: typed nodes + edges.

    Edges only connect plans present in the graph; companion/handoff refs that
    resolve to non-plan documents are surfaced as ``external_doc_count`` instead.
    """
    bundles = await _h.list_plan_bundles(db)
    if not include_hidden:
        bundles = [b for b in bundles if b.doc.status not in HIDDEN_STATUSES]

    by_id = {b.id: b for b in bundles}
    plan_ids: Set[str] = set(by_id.keys())

    # Parent → direct children, restricted to in-graph plans.
    children: Dict[str, List[str]] = {}
    for b in bundles:
        pid = b.plan.parent_id
        if pid and pid in by_id:
            children.setdefault(pid, []).append(b.id)

    def collect_descendants(pid: str) -> Set[str]:
        acc: Set[str] = set()
        stack = list(children.get(pid, []))
        while stack:
            cur = stack.pop()
            if cur in acc:
                continue
            acc.add(cur)
            stack.extend(children.get(cur, []))
        return acc

    own: Dict[str, GraphPoints] = {b.id: _own_points(b.plan.checkpoints) for b in bundles}

    # Reverse-dependency counts (how many in-graph plans depend on each plan).
    depended_on_by: Dict[str, int] = {pid: 0 for pid in plan_ids}
    for b in bundles:
        for dep in b.plan.depends_on or []:
            if dep in plan_ids:
                depended_on_by[dep] += 1

    nodes: List[PlanGraphNode] = []
    edges: List[PlanGraphEdge] = []
    seen_edge: Set[Tuple[str, str, str]] = set()

    def add_edge(src: str, tgt: str, kind: str) -> None:
        if src == tgt:
            return
        key = (src, tgt, kind)
        if key in seen_edge:
            return
        seen_edge.add(key)
        edges.append(PlanGraphEdge(source=src, target=tgt, kind=kind))

    for b in bundles:
        plan, doc = b.plan, b.doc
        descendants = collect_descendants(b.id)

        st = GraphPoints(done=own[b.id].done, total=own[b.id].total)
        for d in descendants:
            st.done += own[d].done
            st.total += own[d].total

        deps = [d for d in (plan.depends_on or []) if d in plan_ids]
        comps = [c for c in (plan.companions or []) if c in plan_ids]
        hands = [h for h in (plan.handoffs or []) if h in plan_ids]
        external = sum(
            1
            for ref in list(plan.companions or []) + list(plan.handoffs or [])
            if ref not in plan_ids
        )
        parent_id = plan.parent_id if plan.parent_id in by_id else None

        nodes.append(
            PlanGraphNode(
                id=b.id,
                title=doc.title,
                status=doc.status,
                stage=_h._normalize_stage_for_response(plan.stage),
                plan_type=plan.plan_type,
                priority=plan.priority,
                summary=doc.summary or "",
                parent_id=parent_id,
                tags=doc.tags or [],
                progress=own[b.id],
                subtree_progress=st,
                descendant_count=len(descendants),
                depends_on_count=len(deps),
                depended_on_by_count=depended_on_by.get(b.id, 0),
                external_doc_count=external,
            )
        )

        if parent_id:
            add_edge(parent_id, b.id, "parent")
        for d in deps:
            add_edge(b.id, d, "depends_on")
        for c in comps:
            add_edge(b.id, c, "companion")
        for h in hands:
            add_edge(b.id, h, "handoff")

    return PlanGraphResponse(nodes=nodes, edges=edges)
