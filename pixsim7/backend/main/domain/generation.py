"""
Unified Generation model - replaces Job + GenerationArtifact

Purpose:
    Single canonical record for the entire generation lifecycle.
    Combines lifecycle tracking (status, timing) with canonical parameters,
    inputs, and prompt versioning.

Design:
    - Immutable fields: operation_type, provider_id, params, inputs, hash, prompt data
    - Mutable fields: status, timestamps, retry_count, asset_id
    - Single source of truth for generation records
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
from pydantic import field_validator
import hashlib
import json

from .enums import OperationType, GenerationStatus, BillingState, enum_column


def _normalize_enum(v, enum_cls):
    """Normalize enum value - handles uppercase DB values."""
    if v is None or isinstance(v, enum_cls):
        return v
    if isinstance(v, str):
        return enum_cls(v.lower())
    return v


class Generation(SQLModel, table=True):
    """
    Unified generation record: replaces Job + GenerationArtifact.

    Immutable-ish fields (set at creation):
      - operation_type, provider_id
      - raw_params, canonical_params
      - inputs, reproducible_hash
      - prompt_version_id, final_prompt

    Mutable lifecycle fields:
      - status, started_at, completed_at
      - error_message, retry_count
      - asset_id (on completion)
    """
    __tablename__ = "generations"

    # Identity
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    workspace_id: Optional[int] = Field(
        default=None,
        foreign_key="workspaces.id",
        index=True,
    )

    # Operation
    operation_type: OperationType = Field(
        sa_column=enum_column(OperationType, "operation_type_enum", index=True)
    )
    provider_id: str = Field(max_length=50, index=True)

    # Params
    raw_params: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Original request params (from API)",
    )
    canonical_params: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Normalized params (post mapper, pre provider)",
    )

    # Inputs & reproducibility
    inputs: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Ordered input refs (seed images, source videos, etc.)",
    )
    reproducible_hash: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
    )

    # Prompt versioning (legacy + new structured config)
    prompt_version_id: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_versions.id",
        index=True,
        description="LEGACY: Direct version reference (use prompt_config instead)"
    )
    final_prompt: Optional[str] = Field(
        default=None,
        description="Final prompt after variable substitution",
    )

    # Structured prompt configuration (added 2025-11-18)
    prompt_config: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="""Structured prompt configuration:
        {
            "versionId": "uuid",         // Specific version ID
            "familyId": "uuid",          // Family with auto-select
            "autoSelectLatest": true,    // Use latest version from family
            "variables": {...},          // Template variables
            "inlinePrompt": "..."        // DEPRECATED: inline prompt for testing
        }"""
    )
    prompt_source_type: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Prompt source: 'versioned', 'inline', 'generated', 'unknown'"
    )

    # Lifecycle
    status: GenerationStatus = Field(
        default=GenerationStatus.PENDING,
        sa_column=enum_column(GenerationStatus, "generation_status_enum", index=True),
        description="Generation status (you can introduce GenerationStatus later)",
    )
    priority: int = Field(default=5, index=True)
    scheduled_at: Optional[datetime] = Field(default=None, index=True)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = Field(default=0)
    parent_generation_id: Optional[int] = Field(
        default=None,
        foreign_key="generations.id",
        index=True,
    )

    # Result
    asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        index=True
    )

    # Billing
    account_id: Optional[int] = Field(
        default=None,
        foreign_key="provider_accounts.id",
        index=True,
        description="Provider account that was charged"
    )
    estimated_credits: Optional[int] = Field(
        default=None,
        description="Credit estimate computed at creation time"
    )
    actual_credits: Optional[int] = Field(
        default=None,
        description="Final credit cost after completion"
    )
    credit_type: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Credit type used (e.g., 'web', 'openapi')"
    )
    billing_state: BillingState = Field(
        default=BillingState.PENDING,
        sa_column=enum_column(BillingState, "billing_state_enum", index=True),
        description="Billing state: pending, charged, skipped, failed"
    )
    charged_at: Optional[datetime] = Field(
        default=None,
        description="When credits were successfully deducted"
    )
    billing_error: Optional[str] = Field(
        default=None,
        description="Error message if billing failed"
    )

    # Metadata
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_generation_user_status_created", "user_id", "status", "created_at"),
        Index("idx_generation_status_created", "status", "created_at"),
        Index("idx_generation_priority_created", "priority", "created_at"),
    )

    # Validators to handle uppercase DB values (legacy data)
    @field_validator("operation_type", mode="before")
    @classmethod
    def normalize_operation_type(cls, v):
        return _normalize_enum(v, OperationType)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v):
        return _normalize_enum(v, GenerationStatus)

    @field_validator("billing_state", mode="before")
    @classmethod
    def normalize_billing_state(cls, v):
        return _normalize_enum(v, BillingState)

    def __repr__(self) -> str:
        return (
            f"<Generation(id={self.id}, "
            f"op={self.operation_type.value}, "
            f"provider={self.provider_id}, "
            f"status={self.status.value})>"
        )

    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate generation duration"""
        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def is_terminal(self) -> bool:
        """Check if generation is in a terminal state"""
        return self.status in {
            GenerationStatus.COMPLETED,
            GenerationStatus.FAILED,
            GenerationStatus.CANCELLED
        }

    @staticmethod
    def compute_hash(canonical_params: Dict[str, Any], inputs: List[Dict[str, Any]]) -> str:
        """
        Compute stable SHA256 over canonical params + inputs.

        Ensures dict keys order doesn't affect hash by dumping with sort_keys.
        This is the same logic from GenerationArtifact.compute_hash.
        """
        data = {
            "canonical_params": canonical_params,
            "inputs": inputs,
        }
        raw = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
