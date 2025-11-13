"""GenerationArtifact model - canonical generation snapshot (Phase 1)

Purpose:
    Immutable record of canonicalized parameters and input assets used
    for a generation attempt (prior to provider mapping specifics).

Phase 1 Fields:
    - job_id: Link to Job
    - operation_type: Copy of Job.operation_type for index convenience
    - canonical_params: Normalized params (post parameter mapper)
    - inputs: List of input references {role, remote_url?, asset_id?, media_type?}
    - reproducible_hash: SHA256 of canonical_params + ordered inputs for dedup
    - created_at: Timestamp

Future Phases:
    - timing, intermediates, content_safety, retry_group_id

Notes:
    We intentionally DO NOT duplicate provider-specific mapped payload or
    response here (those live in ProviderSubmission). This model is provider-agnostic.
"""
from __future__ import annotations

from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
import hashlib
import json

from .enums import OperationType


class GenerationArtifact(SQLModel, table=True):
    __tablename__ = "generation_artifacts"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Link to job (each successful attempt generally has one artifact)
    job_id: int = Field(foreign_key="jobs.id", index=True)

    # Copy of operation for fast queries without joining Job
    operation_type: OperationType = Field(index=True)

    # Canonical normalized parameters (post mapper, pre provider mapping)
    canonical_params: Dict[str, Any] = Field(
        sa_column=Column(JSON),
        description="Provider-agnostic normalized generation parameters"
    )

    # Input assets or remote references used by the operation
    # Example list items:
    #   {"role": "seed_image", "remote_url": "https://.../img.png"}
    #   {"role": "source_video", "asset_id": 123}
    inputs: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Ordered input references for reproducibility"
    )

    reproducible_hash: str = Field(
        max_length=64,
        index=True,
        description="SHA256 of canonical_params + inputs for dedup/retry grouping"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_artifact_job_op", "job_id", "operation_type"),
    )

    def __repr__(self) -> str:  # pragma: no cover - trivial
        return f"<GenerationArtifact(id={self.id}, job_id={self.job_id}, op={self.operation_type.value})>"

    @staticmethod
    def compute_hash(canonical_params: Dict[str, Any], inputs: List[Dict[str, Any]]) -> str:
        """Compute stable SHA256 over canonical params + inputs.

        Ensures dict keys order doesn't affect hash by dumping with sort_keys.
        """
        data = {
            "canonical_params": canonical_params,
            "inputs": inputs,
        }
        raw = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
