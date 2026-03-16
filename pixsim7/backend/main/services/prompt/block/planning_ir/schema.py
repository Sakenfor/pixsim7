"""Pydantic schema for the Prompt Planning IR."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SelectedPrimitiveRecord(BaseModel):
    """A primitive selected during resolution."""
    primitive_id: str
    db_id: Optional[str] = None
    target_key: str
    category: Optional[str] = None
    text: str
    score: Optional[float] = None
    reasons: List[str] = Field(default_factory=list)
    tags: Dict[str, Any] = Field(default_factory=dict)


class SlotRecord(BaseModel):
    """Outcome record for a single template slot."""
    slot_index: int
    target_key: str
    label: Optional[str] = None
    category: Optional[str] = None
    role: Optional[str] = None
    optional: bool = False
    outcome: str  # "selected" | "fallback" | "empty" | "skipped"
    fallback_text: Optional[str] = None
    fallback_reason: Optional[str] = None


class ConstraintRecord(BaseModel):
    """Record of a constraint and its satisfaction status."""
    constraint_id: str
    kind: str
    target_key: Optional[str] = None
    satisfied: bool = True
    payload: Dict[str, Any] = Field(default_factory=dict)


class RenderPlan(BaseModel):
    """How the resolved primitives were composed into final text."""
    composition_strategy: str = "sequential"  # "sequential" | "layered" | "merged"
    layer_assignments: Dict[str, str] = Field(default_factory=dict)
    budget_actions: List[Dict[str, Any]] = Field(default_factory=list)
    final_text: str = ""
    char_count: int = 0


class PlanProvenance(BaseModel):
    """Provenance metadata for the plan."""
    compiler_id: str = "compiler_v1"
    resolver_id: str = "next_v1"
    template_id: Optional[str] = None
    template_slug: Optional[str] = None
    seed: Optional[int] = None
    control_values: Dict[str, Any] = Field(default_factory=dict)
    candidate_counts: Dict[str, int] = Field(default_factory=dict)
    resolution_trace_summary: Dict[str, int] = Field(default_factory=dict)


class PromptPlanIR(BaseModel):
    """Typed Prompt Planning Intermediate Representation.

    Versioned, deterministic IR between primitive resolution and prompt rendering.
    Wraps ResolutionRequest/Result with provenance tracking.
    """
    ir_version: str = "1.0.0"
    plan_id: str
    created_at: str  # ISO 8601

    selected_primitives: List[SelectedPrimitiveRecord] = Field(default_factory=list)
    slots: List[SlotRecord] = Field(default_factory=list)
    constraints: List[ConstraintRecord] = Field(default_factory=list)
    resolved_tags: Dict[str, Any] = Field(default_factory=dict)
    resolved_ontology_ids: List[str] = Field(default_factory=list)

    render_plan: RenderPlan = Field(default_factory=RenderPlan)
    provenance: PlanProvenance = Field(default_factory=PlanProvenance)
    deterministic_hash: str = ""
