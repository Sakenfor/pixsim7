"""
Journey Flow Mapping contract models (v1).

These models mirror the shared TypeScript contract in:
packages/shared/types/src/flowMap.ts
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field


FlowGraphVersion = Literal["1.0.0"]
FlowDomain = Literal["scene", "character", "generation", "world", "asset"]
FlowNodeKind = Literal["panel", "action", "api", "job", "artifact", "gate"]
FlowRunStatus = Literal["in_progress", "completed", "blocked", "abandoned"]


class FlowNode(BaseModel):
    id: str
    kind: FlowNodeKind
    label: str
    ref: Optional[str] = None
    required_caps: Optional[List[str]] = None


class FlowEdge(BaseModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    condition: Optional[str] = None
    on_fail_reason: Optional[str] = None

    model_config = {"populate_by_name": True}


class FlowTemplate(BaseModel):
    id: str
    label: str
    domain: FlowDomain
    start_node_id: str
    nodes: List[FlowNode] = Field(default_factory=list)
    edges: List[FlowEdge] = Field(default_factory=list)
    tags: Optional[List[str]] = None


class FlowRunSummary(BaseModel):
    template_id: str
    started_at: str
    ended_at: Optional[str] = None
    status: FlowRunStatus
    last_node_id: Optional[str] = None


class FlowGraphMetrics(BaseModel):
    total_templates: int
    total_runs: int
    blocked_edges_24h: int


class FlowGraphV1(BaseModel):
    version: FlowGraphVersion = "1.0.0"
    generated_at: str
    templates: List[FlowTemplate] = Field(default_factory=list)
    runs: List[FlowRunSummary] = Field(default_factory=list)
    metrics: FlowGraphMetrics


class FlowResolveContext(BaseModel):
    project_id: Optional[str] = None
    world_id: Optional[str] = None
    location_id: Optional[str] = None
    active_character_id: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    flags: List[str] = Field(default_factory=list)


class FlowResolveRequest(BaseModel):
    goal: str
    context: FlowResolveContext = Field(default_factory=FlowResolveContext)


class FlowCandidateTemplate(BaseModel):
    id: str
    kind: Literal["candidate_template"] = "candidate_template"
    template_id: str
    label: str
    domain: FlowDomain
    status: Literal["ready", "blocked"]
    progressed_node_ids: List[str] = Field(default_factory=list)
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    blocked_reason_code: Optional[str] = None
    blocked_reason: Optional[str] = None


class FlowNextStep(BaseModel):
    id: str
    template_id: str
    node_id: str
    label: str
    kind: FlowNodeKind
    ref: Optional[str] = None


class FlowBlockedStep(BaseModel):
    id: str
    kind: Literal["blocked_step"] = "blocked_step"
    template_id: str
    edge_id: str
    node_id: str
    label: str
    reason_code: str
    reason: str


class FlowSuggestedPath(BaseModel):
    id: str
    kind: Literal["suggested_path"] = "suggested_path"
    template_id: str
    node_ids: List[str] = Field(default_factory=list)
    blocked: bool
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    blocked_reason_code: Optional[str] = None
    blocked_reason: Optional[str] = None


class FlowResolveResponse(BaseModel):
    version: FlowGraphVersion = "1.0.0"
    generated_at: str
    goal: str
    candidate_templates: List[FlowCandidateTemplate] = Field(default_factory=list)
    next_steps: List[FlowNextStep] = Field(default_factory=list)
    blocked_steps: List[FlowBlockedStep] = Field(default_factory=list)
    suggested_path: Optional[FlowSuggestedPath] = None


class FlowTraceRequest(BaseModel):
    template_id: str
    run_id: Optional[str] = None
    node_id: str
    status: FlowRunStatus
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    occurred_at: Optional[str] = None


class FlowTraceResponse(BaseModel):
    accepted: Literal[True] = True
    template_id: str
    run_id: str
    run_summary: FlowRunSummary
    blocked_edges_24h: int
