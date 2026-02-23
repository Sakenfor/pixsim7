"""
Guidance Plan v1 — Pydantic models.

Structured non-text guidance inputs (character references, spatial regions,
masks, constraints) that flow alongside template-driven generation.

Phase A delivers ``references``. Regions, masks, and constraints are typed
upfront so future phases require no schema changes.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Reference (Phase A — active)
# ---------------------------------------------------------------------------

class GuidanceReference(BaseModel):
    """Single character/style reference bound to a composition slot."""

    asset_id: str | int = Field(
        ...,
        description="Asset identifier (e.g. 'asset:5' or numeric ID)",
    )
    kind: str = Field(
        "identity",
        description="Reference kind: identity, style, pose, garment",
    )
    priority: Optional[int] = Field(
        None,
        description="Lower number = earlier provider image index",
    )
    view: Optional[str] = Field(None, description="Camera view hint")
    pose: Optional[str] = Field(None, description="Pose hint")
    label: Optional[str] = Field(None, description="Human-readable label for legend text")

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Region (Phase B — typed now, consumed later)
# ---------------------------------------------------------------------------

class GuidanceRegion(BaseModel):
    """Spatial attention region as a normalized bounding box."""

    box: list[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Normalized [x1, y1, x2, y2], each in [0, 1]",
    )
    binding_key: str = Field(..., description="Binding key this region applies to")
    strength: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="Attention strength"
    )
    label: Optional[str] = None

    @field_validator("box", mode="after")
    @classmethod
    def validate_box_coords(cls, v: list[float]) -> list[float]:
        for i, val in enumerate(v):
            if not 0.0 <= val <= 1.0:
                raise ValueError(
                    f"box[{i}] = {val} is outside normalized range [0, 1]"
                )
        x1, y1, x2, y2 = v
        if x1 >= x2:
            raise ValueError(f"box x1 ({x1}) must be < x2 ({x2})")
        if y1 >= y2:
            raise ValueError(f"box y1 ({y1}) must be < y2 ({y2})")
        return v

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Mask (Phase C — typed now, consumed later)
# ---------------------------------------------------------------------------

class GuidanceMask(BaseModel):
    """Named mask (URL, base64, or asset ref)."""

    format: str = Field(
        ...,
        pattern="^(url|base64|asset_ref)$",
        description="Mask format",
    )
    data: str = Field(..., description="Mask data (depends on format)")
    channel: Optional[str] = None
    invert: bool = False

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Constraints (Phase D — typed now, consumed later)
# ---------------------------------------------------------------------------

class GuidanceConstraints(BaseModel):
    """Generation-level boolean locks and strength knobs."""

    lock_camera: Optional[bool] = None
    lock_pose: Optional[bool] = None
    lock_expression: Optional[bool] = None
    lock_garment: Optional[bool] = None
    style_strength: Optional[float] = Field(None, ge=0.0, le=1.0)
    identity_strength: Optional[float] = Field(None, ge=0.0, le=1.0)

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

class GuidanceProvenance(BaseModel):
    """Audit trail for plan origin."""

    source: Optional[str] = None
    template_id: Optional[str] = None
    created_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Top-Level Plan
# ---------------------------------------------------------------------------

class GuidancePlanV1(BaseModel):
    """
    Guidance Plan v1 — top-level container.

    Carries structured non-text guidance inputs alongside template-driven
    generation. Keyed dicts use the *binding key* (e.g. ``"woman"``,
    ``"background"``) as the map key.
    """

    version: Literal[1] = 1
    references: Optional[Dict[str, GuidanceReference]] = None
    regions: Optional[Dict[str, List[GuidanceRegion]]] = None
    masks: Optional[Dict[str, GuidanceMask]] = None
    constraints: Optional[GuidanceConstraints] = None
    provenance: Optional[GuidanceProvenance] = None

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="after")
    def check_not_empty(self) -> "GuidancePlanV1":
        """Warn-level: a plan with zero sections is technically valid but odd."""
        # We don't raise — the validator layer handles warnings.
        return self
