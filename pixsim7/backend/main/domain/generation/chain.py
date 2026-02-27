"""
GenerationChain model - First-class orchestration entity.

A GenerationChain defines a sequential pipeline of generation steps, where each
step references a BlockTemplate (or provides an inline prompt) and specifies operation type,
input wiring, control overrides, and guidance inheritance rules.

Design boundaries:
- BlockTemplate = semantic prompt recipe (slots, controls, character bindings)
- GenerationChain = orchestration plan (steps, wiring, per-step guidance)
- GuidancePlan = runtime control payload (per step / per run)

Chain steps are stored as embedded JSONB — always loaded/saved with their chain.
Each step has a stable `id` for graph-compatible wiring (input_from references).

See: docs/design/SEQUENTIAL_GENERATION_DESIGN.md
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Index, Text
from sqlmodel import Field, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class GenerationChain(SQLModel, table=True):
    """
    Orchestration plan: an ordered sequence of generation steps that pipe
    results from one to the next. Each step references a BlockTemplate by ID
    or provides an inline prompt.
    """

    __tablename__ = "generation_chains"

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique chain identifier",
    )

    # Identity
    name: str = Field(
        max_length=255,
        description="Human-readable chain name",
    )
    description: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="What this chain produces and when to use it",
    )

    # Steps (embedded JSON array — loaded/saved with chain)
    steps: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description=(
            "Ordered step definitions. Each step: "
            "{id, label?, template_id?, prompt?, repeat_count?, provider_id?, preferred_account_id?, "
            "inherit_previous_settings?, params_overrides?, operation?, input_from?, "
            "control_overrides?, character_binding_overrides?, "
            "guidance?, guidance_inherit?}"
        ),
    )

    # Organization
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Tags for search/filtering",
    )

    # Flexible metadata (authoring hints, UI state, future extensions)
    chain_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="chain_metadata"),
        description="Extensible metadata",
    )

    # Access
    is_public: bool = Field(
        default=False,
        index=True,
        description="Is this chain publicly available?",
    )
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User/system that created this chain",
    )

    # Usage tracking
    execution_count: int = Field(
        default=0,
        description="Number of times this chain has been executed",
    )

    # Timestamps
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        Index("idx_generation_chain_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<GenerationChain(id={self.id}, name='{self.name}', steps={len(self.steps)})>"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_step(self, step_id: str) -> Optional[Dict[str, Any]]:
        """Find a step by its stable ID."""
        for step in self.steps:
            if step.get("id") == step_id:
                return step
        return None

    def step_ids(self) -> List[str]:
        """Return ordered list of step IDs."""
        return [s["id"] for s in self.steps if "id" in s]

    def resolve_input_from(self, step_index: int) -> Optional[str]:
        """
        Resolve the input_from for a step. If not explicitly set,
        defaults to the previous step's ID (sequential wiring).
        Returns None for the first step.
        """
        if step_index <= 0 or step_index >= len(self.steps):
            return None
        step = self.steps[step_index]
        explicit = step.get("input_from")
        if explicit:
            return explicit
        return self.steps[step_index - 1].get("id")


class ChainExecution(SQLModel, table=True):
    """
    Tracks the execution of a GenerationChain run.

    One row per chain execution. Per-step state is stored as JSONB.
    Linked to GenerationRunContext via run_id.
    """

    __tablename__ = "chain_executions"

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique execution identifier (also used as run_id)",
    )

    # Link to chain definition
    chain_id: UUID = Field(
        index=True,
        description="GenerationChain that was executed",
    )

    # Snapshot of steps at execution time (chain may be edited later)
    steps_snapshot: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Frozen copy of chain.steps at execution start",
    )

    # Per-step execution state
    step_states: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description=(
            "Per-step execution state. Each: "
            "{step_id, status, generation_id?, result_asset_id?, "
            "source_asset_id?, roll_result?, compiled_guidance?, "
            "formatter_warnings?, error?, started_at?, completed_at?}"
        ),
    )

    # Overall execution status
    status: str = Field(
        default="pending",
        max_length=20,
        index=True,
        description="pending | running | completed | failed | cancelled",
    )
    current_step_index: int = Field(
        default=0,
        description="Index of the step currently being executed",
    )
    error_message: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="Top-level error if chain execution failed",
    )

    # Context
    user_id: Optional[int] = Field(default=None, index=True)
    execution_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Extensible (initial asset IDs, provider prefs, etc.)",
    )

    # Timestamps
    created_at: datetime = Field(default_factory=utcnow, index=True)
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)

    __table_args__ = (
        Index("idx_chain_execution_chain", "chain_id"),
        Index("idx_chain_execution_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ChainExecution(id={self.id}, chain_id={self.chain_id}, "
            f"status='{self.status}', step={self.current_step_index}/{len(self.steps_snapshot)})>"
        )
