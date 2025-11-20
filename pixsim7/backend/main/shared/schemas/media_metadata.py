"""
Structured media metadata helpers

Defines optional recognition / annotation fields for assets, such as:
- detected faces (for mapping to NPCs)
- actions (sitting, walking, kissing, etc.)
- interactions (multi-participant events)

These are best-effort and optional; game logic should use them when present
but never require them.
"""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class DetectedFace(BaseModel):
    """Single detected face in a frame/video"""
    face_id: str = Field(..., description="Stable identifier for the face (mapped to NPC externally)")
    confidence: float = Field(..., ge=0.0, le=1.0)


class DetectedAction(BaseModel):
    """Single detected action / pose label"""
    label: str = Field(..., description="Action label: sitting, walking, eating, etc.")
    confidence: float = Field(..., ge=0.0, le=1.0)


class DetectedInteraction(BaseModel):
    """Multi-participant interaction (e.g., kiss, handshake)"""
    label: str = Field(..., description="Interaction label: kiss, hug, argue, etc.")
    participants: List[str] = Field(default_factory=list, description="List of face_ids participating in the interaction")
    confidence: float = Field(..., ge=0.0, le=1.0)


class RecognitionMetadata(BaseModel):
    """
    Optional recognition metadata for an asset.

    This can be populated by offline analysis (face recognition, pose estimation,
    action recognition, etc.) and used by higher-level systems (scene builder,
    game world) to search for appropriate clips.
    """
    faces: List[DetectedFace] = Field(default_factory=list)
    actions: List[DetectedAction] = Field(default_factory=list)
    interactions: List[DetectedInteraction] = Field(default_factory=list)

