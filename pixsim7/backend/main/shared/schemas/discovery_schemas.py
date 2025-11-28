"""
Shared schemas for AI-assisted discovery features.

These models are used across both API and service layers for category/pack/block discovery.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class SuggestedOntologyId(BaseModel):
    """A suggested ontology ID from AI analysis."""
    id: str
    label: str
    description: Optional[str] = None
    kind: str  # e.g. "action", "state", "part", "manner", "agency"
    confidence: float


class SuggestedPackEntry(BaseModel):
    """A suggested semantic pack entry."""
    pack_id: str
    pack_label: str
    parser_hints: Dict[str, List[str]]  # candidate hints for this pack
    notes: Optional[str] = None


class SuggestedActionBlock(BaseModel):
    """A suggested ActionBlock for reuse."""
    block_id: str
    prompt: str
    tags: Dict[str, Any]
    notes: Optional[str] = None
